import {
  AcceptanceContractSchema,
  AcceptanceReceiptSchema,
  VerifyRequestSchema,
  hashAcceptanceReceipt,
  sha256Canonical,
  type AcceptanceContract,
  type VerifyRequest,
} from "@shipcheck/domain";
import {
  ApiErrorBodySchema,
  EvidenceLinkResponseSchema,
  ReceiptVerificationResponseSchema,
  ReportBundleResponseSchema,
  RequestStatusResponseSchema,
  VerifyResponseSchema,
  type ApiErrorCode,
  type EvidenceLinkProvider,
  type IdempotencyStore,
  type ReceiptStore,
  type ReportBundle,
  type ReportStore,
  type RequestStore,
  type VerifyResponse,
} from "@shipcheck/service-core";
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from "express";
import { ZodError } from "zod";
import { RequirementCompilationError } from "@shipcheck/requirement-compiler";
import {
  createHealthHandlers,
  createCorsMiddleware,
  createMetricsAuthMiddleware,
  createRequestTelemetryMiddleware,
  renderMetrics,
  type HealthHandlerOptions,
  type ShipCheckMetrics,
  type StructuredLogger,
} from "@shipcheck/service-ops";

import { createVerifyStageLogger } from "./verify-stage-log.js";

export interface VerifyOperationResult {
  readonly response: VerifyResponse;
  readonly reportBundle: ReportBundle;
}

export interface VerificationOperations {
  compile(input: VerifyRequest): Promise<AcceptanceContract>;
  verify(
    input: VerifyRequest,
    requestId: string,
  ): Promise<VerifyOperationResult>;
}

export interface ApiAppOptions {
  readonly operations: VerificationOperations;
  readonly requestStore: RequestStore<VerifyResponse>;
  readonly receiptStore: ReceiptStore;
  readonly reportStore: ReportStore;
  readonly idempotencyStore: IdempotencyStore<VerifyResponse>;
  readonly evidenceLinkProvider?: EvidenceLinkProvider;
  readonly evidenceLinkTtlSeconds?: number;
  readonly createRequestId: () => string;
  readonly now: () => string;
  readonly paymentMiddleware?: RequestHandler;
  readonly verificationEnabled?: boolean;
  readonly telemetry?: {
    readonly logger: StructuredLogger;
    readonly metrics: ShipCheckMetrics;
  };
  readonly metricsBearerToken?: string;
  readonly health?: HealthHandlerOptions;
  readonly corsAllowedOrigins?: readonly string[];
}

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

interface IdempotencyContext {
  readonly input: VerifyRequest;
  readonly key: string;
  readonly fingerprint: string;
}

interface ResponseFinalization {
  commit(): Promise<void>;
  rollback(preserveClaim: boolean): Promise<void>;
}

function validationError(error: ZodError): ServiceError {
  return new ServiceError(400, "INVALID_REQUEST", "Request validation failed", {
    issues: error.issues.map(({ path, message }) => ({ path, message })),
  });
}

function isMalformedJsonError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { readonly status?: unknown; readonly type?: unknown };
  return candidate.status === 400 && candidate.type === "entity.parse.failed";
}

function parseRequest(input: unknown): VerifyRequest {
  try {
    return VerifyRequestSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) throw validationError(error);
    throw error;
  }
}

function idempotencyKey(
  headerValue: string | undefined,
  input: VerifyRequest,
): string | undefined {
  if (
    headerValue !== undefined &&
    input.idempotencyKey !== undefined &&
    headerValue !== input.idempotencyKey
  ) {
    throw new ServiceError(
      400,
      "INVALID_REQUEST",
      "Header and body idempotency keys must match",
    );
  }
  const key = headerValue ?? input.idempotencyKey;
  if (key !== undefined && (key.length < 8 || key.length > 128)) {
    throw new ServiceError(
      400,
      "INVALID_REQUEST",
      "Idempotency key must contain 8 to 128 characters",
    );
  }
  return key;
}

function hasPotentialIdempotencyKey(
  body: unknown,
  headerValue: string | undefined,
): boolean {
  return (
    headerValue !== undefined ||
    (typeof body === "object" &&
      body !== null &&
      "idempotencyKey" in body &&
      typeof body.idempotencyKey === "string")
  );
}

function requestFingerprint(input: VerifyRequest): string {
  return sha256Canonical({
    brief: input.brief,
    deliveryUrl: input.deliveryUrl,
    mode: input.mode,
    maxRequirements: input.maxRequirements,
  });
}

function sendError(
  response: express.Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  requestId?: string,
): void {
  response.status(status).json(
    ApiErrorBodySchema.parse({
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
        ...(requestId === undefined ? {} : { requestId }),
      },
    }),
  );
}

export function createApiApp(options: ApiAppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  if (options.corsAllowedOrigins !== undefined && options.corsAllowedOrigins.length > 0) {
    app.use(createCorsMiddleware(options.corsAllowedOrigins));
  }
  if (options.telemetry !== undefined) {
    app.use(
      createRequestTelemetryMiddleware({
        logger: options.telemetry.logger,
        metrics: options.telemetry.metrics,
      }),
    );
  }
  app.use(express.json({ limit: "16kb", strict: true }));

  const health = createHealthHandlers(
    options.health ?? { configReady: () => true },
  );
  app.get("/health", health.legacyHealth);
  app.get("/health/live", health.live);
  app.get("/health/ready", health.ready);
  if (options.telemetry !== undefined) {
    const telemetry = options.telemetry;
    app.get(
      "/metrics",
      createMetricsAuthMiddleware(options.metricsBearerToken),
      async (_request, response) => {
        response.set("Content-Type", telemetry.metrics.registry.contentType);
        response.send(await renderMetrics(telemetry.metrics));
      },
    );
  }

  const verificationDisabledHandler: RequestHandler = (_request, response) => {
    sendError(
      response,
      503,
      "EXECUTION_UNAVAILABLE",
      "Verification is temporarily disabled",
    );
  };

  app.post("/v1/compile", async (request, response) => {
    const input = parseRequest(request.body);
    const contract = await options.operations.compile(input);
    response.json(AcceptanceContractSchema.parse(contract));
  });

  const idempotencyPreflight: RequestHandler = async (
    request,
    response,
    next,
  ) => {
    const headerValue = request.get("Idempotency-Key");
    if (!hasPotentialIdempotencyKey(request.body, headerValue)) {
      next();
      return;
    }
    const input = parseRequest(request.body);
    const key = idempotencyKey(headerValue, input);
    if (key === undefined) {
      next();
      return;
    }
    const fingerprint = requestFingerprint(input);
    const existing = await options.idempotencyStore.inspect(
      "verify",
      key,
      fingerprint,
    );
    if (existing.outcome === "REPLAY") {
      options.telemetry?.metrics.recordIdempotencyHit();
      response.set("Idempotency-Replayed", "true");
      response.json(VerifyResponseSchema.parse(existing.value));
      return;
    }
    if (existing.outcome === "CONFLICT") {
      options.telemetry?.metrics.recordIdempotencyConflict();
      throw new ServiceError(
        409,
        "REQUEST_CONFLICT",
        "Idempotency key was already used for another request",
      );
    }
    if (existing.outcome === "IN_PROGRESS") {
      throw new ServiceError(
        409,
        "REQUEST_CONFLICT",
        "An idempotent request with this key is still in progress",
      );
    }
    response.locals["idempotency"] = { input, key, fingerprint };
    next();
  };

  const settlementPersistence: RequestHandler = (_request, response, next) => {
    const originalEnd = response.end.bind(response);
    let finalizationStarted = false;
    response.end = ((...args: unknown[]) => {
      const finalization = response.locals["finalization"] as
        | ResponseFinalization
        | undefined;
      if (finalization === undefined || finalizationStarted) {
        return Reflect.apply(originalEnd, response, args) as express.Response;
      }
      finalizationStarted = true;
      const responseSucceeded =
        response.statusCode >= 200 && response.statusCode < 300;
      const action = responseSucceeded
        ? finalization.commit()
        : finalization.rollback(false);
      void action.then(
        () => {
          Reflect.apply(originalEnd, response, args);
        },
        async () => {
          options.telemetry?.metrics.recordPersistenceFailure();
          await finalization
            .rollback(options.paymentMiddleware !== undefined)
            .catch(() => undefined);
          if (response.headersSent) {
            Reflect.apply(originalEnd, response, args);
            return;
          }
          response.statusCode = 503;
          response.removeHeader("Content-Length");
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          const requestIdForError = response.locals["requestId"] as unknown;
          const body = JSON.stringify(
            ApiErrorBodySchema.parse({
              error: {
                code: "EXECUTION_UNAVAILABLE",
                message: "Unable to persist the settled verification result",
                ...(typeof requestIdForError !== "string"
                  ? {}
                  : { requestId: requestIdForError }),
              },
            }),
          );
          Reflect.apply(originalEnd, response, [body]);
        },
      );
      return response;
    }) as typeof response.end;
    next();
  };

  const verifyStageContext: RequestHandler = (_request, response, next) => {
    const requestId = options.createRequestId();
    const startedAt = Date.now();
    response.locals["requestId"] = requestId;
    response.locals["verifyStartedAt"] = startedAt;
    createVerifyStageLogger({
      requestId,
      startedAt,
      logger: options.telemetry?.logger,
    }).logStage("request_received");
    next();
  };

  const withPaymentStageLogging = (
    middleware: RequestHandler,
  ): RequestHandler => {
    return (request, response, next) => {
      const requestId = response.locals["requestId"];
      const startedAt = response.locals["verifyStartedAt"];
      if (typeof requestId !== "string" || typeof startedAt !== "number") {
        middleware(request, response, next);
        return;
      }
      const stages = createVerifyStageLogger({
        requestId,
        startedAt,
        logger: options.telemetry?.logger,
      });
      let paymentPassed = false;
      const onFinish = (): void => {
        response.removeListener("finish", onFinish);
        if (!paymentPassed && response.statusCode === 402) {
          stages.logStage("payment_challenge", { statusCode: 402 });
        }
      };
      response.on("finish", onFinish);
      middleware(request, response, (error?: unknown) => {
        if (error !== undefined) {
          stages.logFailure(error);
          next(error);
          return;
        }
        paymentPassed = true;
        stages.logStage("payment_verified");
        next();
      });
    };
  };

  const verifyHandler: RequestHandler = async (request, response) => {
    const context = response.locals["idempotency"] as
      | IdempotencyContext
      | undefined;
    const input = context?.input ?? parseRequest(request.body);
    const key =
      context?.key ??
      idempotencyKey(request.get("Idempotency-Key"), input);
    const fingerprint = context?.fingerprint ?? requestFingerprint(input);
    const activeRequestId =
      typeof response.locals["requestId"] === "string"
        ? (response.locals["requestId"] as string)
        : options.createRequestId();
    const startedAt =
      typeof response.locals["verifyStartedAt"] === "number"
        ? (response.locals["verifyStartedAt"] as number)
        : Date.now();
    response.locals["requestId"] = activeRequestId;
    response.locals["verifyStartedAt"] = startedAt;
    const stages = createVerifyStageLogger({
      requestId: activeRequestId,
      startedAt,
      logger: options.telemetry?.logger,
    });
    stages.logStage("input_validated");
    if (options.paymentMiddleware === undefined) {
      // Free / test paths still emit the payment checkpoint so sequences line up.
      stages.logStage("payment_verified");
    }

    let claimAcquired = false;
    if (key !== undefined) {
      const claim = await options.idempotencyStore.claim(
        "verify",
        key,
        fingerprint,
      );
      if (claim.outcome === "REPLAY") {
        options.telemetry?.metrics.recordIdempotencyHit();
        response.set("Idempotency-Replayed", "true");
        stages.logStage("response_sent", { statusCode: 200 });
        response.json(VerifyResponseSchema.parse(claim.value));
        return;
      }
      if (claim.outcome === "CONFLICT") {
        options.telemetry?.metrics.recordIdempotencyConflict();
        throw new ServiceError(
          409,
          "REQUEST_CONFLICT",
          "Idempotency key was already used for another request",
        );
      }
      if (claim.outcome === "IN_PROGRESS") {
        throw new ServiceError(
          409,
          "REQUEST_CONFLICT",
          "An idempotent request with this key is still in progress",
        );
      }
      claimAcquired = true;
    }

    let requestId: string | undefined = activeRequestId;
    let requestStored = false;
    let receiptIdToRollback: string | undefined;
    const rollback = async (preserveClaim: boolean): Promise<void> => {
      const failures: unknown[] = [];
      if (receiptIdToRollback !== undefined) {
        await options.receiptStore
          .delete(receiptIdToRollback)
          .catch((error: unknown) => failures.push(error));
        await options.reportStore
          .delete(receiptIdToRollback)
          .catch((error: unknown) => failures.push(error));
      }
      if (requestStored && requestId !== undefined) {
        await options.requestStore
          .update(requestId, {
            status: "FAILED",
            error: {
              code: "EXECUTION_UNAVAILABLE",
              message: "Payment settlement or response persistence failed",
            },
            updatedAt: options.now(),
          })
          .catch((error: unknown) => failures.push(error));
      }
      if (claimAcquired && key !== undefined && !preserveClaim) {
        await options.idempotencyStore
          .release("verify", key, fingerprint)
          .catch((error: unknown) => failures.push(error));
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, "Verification rollback failed");
      }
    };
    try {
      const createdAt = options.now();
      await options.requestStore.put({
        requestId: activeRequestId,
        input,
        requestHash: fingerprint,
        status: "QUEUED",
        createdAt,
        updatedAt: createdAt,
      });
      requestStored = true;
      await options.requestStore.update(activeRequestId, {
        status: "RUNNING",
        updatedAt: options.now(),
      });
      const resultPayload = await options.operations.verify(
        input,
        activeRequestId,
      );
      const result = VerifyResponseSchema.parse(resultPayload.response);
      receiptIdToRollback = result.receipt.receiptId;
      response.locals["finalization"] = {
        commit: async () => {
          await options.receiptStore.put(result.receipt);
          await options.reportStore.put(resultPayload.reportBundle);
          await options.requestStore.update(activeRequestId, {
            status: "COMPLETED",
            response: result,
            updatedAt: options.now(),
          });
          if (claimAcquired && key !== undefined) {
            await options.idempotencyStore.complete(
              "verify",
              key,
              fingerprint,
              result,
            );
          }
        },
        rollback,
      } satisfies ResponseFinalization;
      stages.logStage("response_sent", { statusCode: 200 });
      response.json(result);
    } catch (error) {
      await rollback(false).catch(() => undefined);
      throw error;
    }
  };

  app.post(
    "/v1/verify",
    verifyStageContext,
    idempotencyPreflight,
    settlementPersistence,
    ...(options.verificationEnabled === false ? [verificationDisabledHandler] : []),
    ...(options.paymentMiddleware === undefined
      ? []
      : [withPaymentStageLogging(options.paymentMiddleware)]),
    verifyHandler,
  );

  app.get("/v1/reports/:receiptId", async (request, response) => {
    const bundle = await options.reportStore.get(request.params["receiptId"]);
    if (bundle === undefined) {
      throw new ServiceError(404, "NOT_FOUND", "Report was not found");
    }
    response.json(
      ReportBundleResponseSchema.parse({
        receiptId: bundle.receiptId,
        contract: bundle.contract,
        verdict: bundle.receipt.verdict,
        summary: bundle.receipt.summary,
        results: bundle.results,
        receipt: bundle.receipt,
        evidenceManifest: bundle.evidenceManifest,
        createdAt: bundle.createdAt,
      }),
    );
  });

  app.get(
    "/v1/reports/:receiptId/evidence/:evidenceId/link",
    async (request, response) => {
      if (options.evidenceLinkProvider === undefined) {
        throw new ServiceError(
          503,
          "EXECUTION_UNAVAILABLE",
          "Evidence links are not configured",
        );
      }
      const receiptId = request.params["receiptId"];
      const evidenceId = request.params["evidenceId"];
      const ttlSeconds = options.evidenceLinkTtlSeconds ?? 900;
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      const link = await options.evidenceLinkProvider.createReadLink(
        receiptId,
        evidenceId,
        expiresAt,
      );
      if (link === undefined) {
        throw new ServiceError(404, "NOT_FOUND", "Evidence artifact was not found");
      }
      response.json(
        EvidenceLinkResponseSchema.parse({
          receiptId,
          evidenceId,
          url: link.url,
          expiresAt: link.expiresAt,
        }),
      );
    },
  );

  app.get("/v1/requests/:requestId", async (request, response) => {
    const record = await options.requestStore.get(request.params["requestId"]);
    if (record === undefined) {
      throw new ServiceError(
        404,
        "NOT_FOUND",
        "Verification request was not found",
      );
    }
    response.json(
      RequestStatusResponseSchema.parse({
        requestId: record.requestId,
        status: record.status,
        ...(record.response === undefined
          ? {}
          : { response: record.response }),
        ...(record.error === undefined ? {} : { error: record.error }),
      }),
    );
  });

  app.get("/v1/receipts/:receiptId", async (request, response) => {
    const receipt = await options.receiptStore.get(
      request.params["receiptId"],
    );
    if (receipt === undefined) {
      throw new ServiceError(
        404,
        "NOT_FOUND",
        "Acceptance receipt was not found",
      );
    }
    response.json(AcceptanceReceiptSchema.parse(receipt));
  });

  app.get("/v1/receipts/:receiptId/verify", async (request, response) => {
    const receipt = await options.receiptStore.get(
      request.params["receiptId"],
    );
    if (receipt === undefined) {
      throw new ServiceError(
        404,
        "NOT_FOUND",
        "Acceptance receipt was not found",
      );
    }
    const receiptHash = hashAcceptanceReceipt(receipt) === receipt.receiptHash;
    response.json(
      ReceiptVerificationResponseSchema.parse({
        receiptId: receipt.receiptId,
        valid: receiptHash,
        checks: { receiptHash },
      }),
    );
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    void next;
    if (isMalformedJsonError(error)) {
      sendError(
        response,
        400,
        "INVALID_REQUEST",
        "Request body must be valid JSON",
      );
      return;
    }
    if (error instanceof ServiceError) {
      sendError(
        response,
        error.status,
        error.code,
        error.message,
        error.details,
        response.locals["requestId"] as string | undefined,
      );
      return;
    }
    if (error instanceof ZodError) {
      const mapped = validationError(error);
      sendError(
        response,
        mapped.status,
        mapped.code,
        mapped.message,
        mapped.details,
        response.locals["requestId"] as string | undefined,
      );
      return;
    }
    if (error instanceof RequirementCompilationError) {
      sendError(
        response,
        422,
        "COMPILATION_FAILED",
        error.message,
        { issues: error.issues },
        response.locals["requestId"] as string | undefined,
      );
      return;
    }
    sendError(
      response,
      500,
      "INTERNAL_ERROR",
      "Unexpected service failure",
      undefined,
      response.locals["requestId"] as string | undefined,
    );
  };
  app.use(errorHandler);

  return app;
}
