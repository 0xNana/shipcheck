import {
  AcceptanceContractSchema,
  AcceptanceReceiptSchema,
  RequirementResultSchema,
  hashAcceptanceReceipt,
  type AcceptanceContract,
  type VerifyRequest,
} from "@shipcheck/domain";
import {
  LocalEvidenceLinkProvider,
  LocalIdempotencyStore,
  LocalReceiptStore,
  LocalReportStore,
  LocalRequestStore,
  ApiErrorBodySchema,
  VerifyResponseSchema,
  type IdempotencyStore,
  type ReceiptStore,
  type ReportStore,
  type RequestStore,
  type VerifyResponse,
} from "@shipcheck/service-core";
import type { RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApiApp, ServiceError } from "../src/index.js";

const verifyInput: VerifyRequest = {
  brief: "Build a launch page with pricing.",
  deliveryUrl: "https://example.com/",
  mode: "quick",
  maxRequirements: 12,
};

const contract = AcceptanceContractSchema.parse({
  schemaVersion: "shipcheck-acceptance-contract-v1.0.0",
  contractId: "contract_1",
  compilerVersion: "compiler-v1",
  policyVersion: "policy-v1",
  executionPolicyVersion: "execution-v1",
  target: "https://example.com/",
  requirements: [
    {
      id: "req_1",
      statement: "A pricing section is present.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "pricing",
        start: 25,
        end: 32,
      },
      priority: "REQUIRED",
      prioritySource: "DEFAULT",
      confidence: 1,
      class: "EXECUTABLE",
      adapter: "PUBLIC_WEB",
      intent: "SECTION_PRESENT",
    },
  ],
  createdAt: "2026-07-12T20:00:00.000Z",
  contractHash: "a".repeat(64),
});

const result = RequirementResultSchema.parse({
  requirementId: "req_1",
  priority: "REQUIRED",
  status: "PASS",
  checkIds: ["check_1"],
  observationIds: ["obs_1"],
  evidenceIds: [],
  expected: "A pricing section is present.",
  observed: "Pricing was visible.",
  rerunEligible: false,
});

const receiptDraft = {
  receiptSchemaVersion: "shipcheck-acceptance-receipt-v1.0.0",
  receiptId: "receipt_1",
  contractHash: contract.contractHash,
  contractSchemaVersion: contract.schemaVersion,
  target: contract.target,
  targetFingerprint: {
    finalUrl: contract.target,
    sha256: "b".repeat(64),
  },
  compilerVersion: contract.compilerVersion,
  executionPolicyVersion: contract.executionPolicyVersion,
  adapterVersion: "adapter-v1",
  evidenceManifestVersion: "shipcheck-evidence-manifest-v1.0.0",
  verdict: "ACCEPTED",
  summary: {
    total: 1,
    passed: 1,
    failed: 0,
    unverified: 0,
    notObjectivelyTestable: 0,
    unsupported: 0,
  },
  results: [result],
  evidenceManifestHash: "c".repeat(64),
  policyVersion: contract.policyVersion,
  testedAt: "2026-07-12T20:00:01.000Z",
};
const receipt = AcceptanceReceiptSchema.parse({
  ...receiptDraft,
  receiptHash: hashAcceptanceReceipt(receiptDraft),
});

function response(requestId = "sc_req_1"): VerifyResponse {
  return {
    requestId,
    contract,
    verdict: "ACCEPTED",
    summary: receipt.summary,
    results: [result],
    receipt,
  };
}

function verifyResult(requestId = "sc_req_1"): VerifyResponse {
  return response(requestId);
}

function verifyOperation(requestId = "sc_req_1") {
  const body = verifyResult(requestId);
  return {
    response: body,
    reportBundle: {
      receiptId: body.receipt.receiptId,
      contract: body.contract,
      results: body.results,
      receipt: body.receipt,
      evidenceManifest: {
        schemaVersion: "shipcheck-evidence-manifest-v1.0.0" as const,
        artifacts: [],
        evidenceManifestHash: body.receipt.evidenceManifestHash,
      },
      createdAt: body.receipt.testedAt,
    },
  };
}

function setup(
  overrides: Partial<{
    compile: (input: VerifyRequest) => Promise<AcceptanceContract>;
    verify: (
      input: VerifyRequest,
      requestId: string,
    ) => Promise<ReturnType<typeof verifyOperation>>;
    paymentMiddleware: RequestHandler;
    requestStore: RequestStore<VerifyResponse>;
    receiptStore: ReceiptStore;
    reportStore: ReportStore;
    idempotencyStore: IdempotencyStore<VerifyResponse>;
    verificationEnabled: boolean;
  }> = {},
) {
  const compile = vi.fn(
    overrides.compile ?? (async () => Promise.resolve(contract)),
  );
  const verify = vi.fn(
    overrides.verify ??
      (async (_input: VerifyRequest, requestId: string) =>
        Promise.resolve(verifyOperation(requestId))),
  );
  const reportStore =
    overrides.reportStore ?? new LocalReportStore();
  const app = createApiApp({
    operations: { compile, verify },
    requestStore:
      overrides.requestStore ?? new LocalRequestStore<VerifyResponse>(),
    receiptStore: overrides.receiptStore ?? new LocalReceiptStore(),
    reportStore,
    idempotencyStore:
      overrides.idempotencyStore ??
      new LocalIdempotencyStore<VerifyResponse>(),
    evidenceLinkProvider: new LocalEvidenceLinkProvider(reportStore),
    createRequestId: () => "sc_req_1",
    now: () => "2026-07-12T20:00:00.000Z",
    ...(overrides.verificationEnabled === undefined
      ? {}
      : { verificationEnabled: overrides.verificationEnabled }),
    ...(overrides.paymentMiddleware === undefined
      ? {}
      : { paymentMiddleware: overrides.paymentMiddleware }),
  });
  return { app, compile, verify, reportStore };
}

describe("ShipCheck API", () => {
  it("reports health without invoking business operations", async () => {
    const { app, compile, verify } = setup();

    await request(app).get("/health").expect(200, { status: "ok" });

    expect(compile).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it("validates and compiles a typed request", async () => {
    const { app, compile } = setup();

    const response = await request(app)
      .post("/v1/compile")
      .send(verifyInput)
      .expect(200);

    expect(response.body).toEqual(contract);
    expect(compile).toHaveBeenCalledWith(verifyInput);
  });

  it("returns a structured validation error at the HTTP boundary", async () => {
    const { app, verify } = setup();

    const response = await request(app)
      .post("/v1/verify")
      .send({ brief: "short", deliveryUrl: "http://localhost" })
      .expect(400);

    expect(response.body).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: "Request validation failed",
      },
    });
    expect(ApiErrorBodySchema.parse(response.body).error.details).toBeDefined();
    expect(verify).not.toHaveBeenCalled();
  });

  it("returns a structured error for malformed JSON", async () => {
    const { app, verify } = setup();

    await request(app)
      .post("/v1/verify")
      .set("Content-Type", "application/json")
      .send('{"brief":')
      .expect(400, {
        error: {
          code: "INVALID_REQUEST",
          message: "Request body must be valid JSON",
        },
      });
    expect(verify).not.toHaveBeenCalled();
  });

  it("executes verification and persists its status and receipt", async () => {
    const { app, verify } = setup();

    const completed = await request(app)
      .post("/v1/verify")
      .send(verifyInput)
      .expect(200);
    const status = await request(app)
      .get("/v1/requests/sc_req_1")
      .expect(200);
    const storedReceipt = await request(app)
      .get("/v1/receipts/receipt_1")
      .expect(200);
    const verification = await request(app)
      .get("/v1/receipts/receipt_1/verify")
      .expect(200);

    expect(VerifyResponseSchema.parse(completed.body).requestId).toBe("sc_req_1");
    expect(status.body).toMatchObject({
      requestId: "sc_req_1",
      status: "COMPLETED",
      response: { verdict: "ACCEPTED" },
    });
    expect(storedReceipt.body).toEqual(receipt);
    expect(verification.body).toEqual({
      receiptId: "receipt_1",
      valid: true,
      checks: { receiptHash: true },
    });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("replays completed idempotent requests without executing twice", async () => {
    const { app, verify } = setup();

    await request(app)
      .post("/v1/verify")
      .set("Idempotency-Key", "same-key-123")
      .send(verifyInput)
      .expect(200);
    const replay = await request(app)
      .post("/v1/verify")
      .set("Idempotency-Key", "same-key-123")
      .send(verifyInput)
      .expect(200);

    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("runs payment before billable verification and blocks unpaid work", async () => {
    const order: string[] = [];
    const paymentMiddleware: RequestHandler = (request, response, next) => {
      order.push("payment");
      if (request.get("X-Test-Payment") !== "valid") {
        response.status(402).json({ x402Version: 2 });
        return;
      }
      next();
    };
    const { app, verify } = setup({
      paymentMiddleware,
      verify: (_input, requestId) => {
        order.push("business");
        return Promise.resolve(verifyOperation(requestId));
      },
    });

    await request(app).post("/v1/verify").send(verifyInput).expect(402);
    expect(verify).not.toHaveBeenCalled();

    await request(app).get("/v1/verify").expect(402);

    await request(app)
      .post("/v1/verify")
      .set("X-Test-Payment", "valid")
      .send(verifyInput)
      .expect(200);
    expect(order).toEqual(["payment", "payment", "payment", "business"]);
  });

  it("serves a completed idempotent replay before requesting payment again", async () => {
    const paymentMiddleware = vi.fn<RequestHandler>(
      (request, response, next) => {
        if (request.get("X-Test-Payment") !== "valid") {
          response.status(402).json({ x402Version: 2 });
          return;
        }
        next();
      },
    );
    const { app, verify } = setup({ paymentMiddleware });

    await request(app)
      .post("/v1/verify")
      .set("Idempotency-Key", "paid-key-123")
      .set("X-Test-Payment", "valid")
      .send(verifyInput)
      .expect(200);
    const replay = await request(app)
      .post("/v1/verify")
      .set("Idempotency-Key", "paid-key-123")
      .send(verifyInput)
      .expect(200);

    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(paymentMiddleware).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("does not cache or persist a result when payment settlement fails", async () => {
    const paymentMiddleware = vi.fn<RequestHandler>(
      (_request, response, next) => {
        const originalEnd = response.end.bind(response);
        let releaseEnd: (() => void) | undefined;
        const endCalled = new Promise<void>((resolve) => {
          releaseEnd = resolve;
        });
        response.end = ((...args: unknown[]) => {
          void args;
          releaseEnd?.();
          return response;
        }) as typeof response.end;
        next();
        void endCalled.then(() => {
          response.status(402);
          response.removeHeader("Content-Length");
          response.set("Content-Type", "application/json");
          originalEnd(JSON.stringify({ error: "settlement failed" }));
        });
      },
    );
    const { app, verify } = setup({ paymentMiddleware });

    await request(app)
      .post("/v1/verify")
      .set("Idempotency-Key", "failed-pay-123")
      .send(verifyInput)
      .expect(402);
    await request(app)
      .post("/v1/verify")
      .set("Idempotency-Key", "failed-pay-123")
      .send(verifyInput)
      .expect(402);

    expect(paymentMiddleware).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenCalledTimes(2);
    await request(app).get("/v1/receipts/receipt_1").expect(404);
  });

  it("releases an idempotency claim when request persistence fails", async () => {
    const backingStore = new LocalRequestStore<VerifyResponse>();
    const requestStore: RequestStore<VerifyResponse> = {
      put: () => Promise.reject(new Error("request store unavailable")),
      get: (requestId) => backingStore.get(requestId),
      update: (requestId, update) => backingStore.update(requestId, update),
    };
    const { app, verify } = setup({ requestStore });

    await request(app)
      .post("/v1/verify")
      .set("Idempotency-Key", "storage-key-123")
      .send(verifyInput)
      .expect(500);
    await request(app)
      .post("/v1/verify")
      .set("Idempotency-Key", "storage-key-123")
      .send(verifyInput)
      .expect(500);

    expect(verify).not.toHaveBeenCalled();
  });

  it("compensates partial persistence when idempotency completion fails", async () => {
    const backingStore = new LocalIdempotencyStore<VerifyResponse>();
    const idempotencyStore: IdempotencyStore<VerifyResponse> = {
      inspect: (namespace, key, fingerprint) =>
        backingStore.inspect(namespace, key, fingerprint),
      claim: (namespace, key, fingerprint) =>
        backingStore.claim(namespace, key, fingerprint),
      complete: () => Promise.reject(new Error("idempotency unavailable")),
      release: (namespace, key, fingerprint) =>
        backingStore.release(namespace, key, fingerprint),
    };
    const paymentMiddleware = vi.fn<RequestHandler>(
      (_request, _response, next) => {
        next();
      },
    );
    const { app, verify } = setup({
      idempotencyStore,
      paymentMiddleware,
    });

    await request(app)
      .post("/v1/verify")
      .set("Idempotency-Key", "completion-key-123")
      .send(verifyInput)
      .expect(503);
    await request(app)
      .post("/v1/verify")
      .set("Idempotency-Key", "completion-key-123")
      .send(verifyInput)
      .expect(409);

    expect(paymentMiddleware).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
    await request(app).get("/v1/receipts/receipt_1").expect(404);
  });

  it("rejects reuse of an idempotency key for a different request", async () => {
    const { app, verify } = setup();
    await request(app)
      .post("/v1/verify")
      .set("Idempotency-Key", "same-key-123")
      .send(verifyInput)
      .expect(200);

    const conflict = await request(app)
      .post("/v1/verify")
      .set("Idempotency-Key", "same-key-123")
      .send({ ...verifyInput, deliveryUrl: "https://other.example/" })
      .expect(409);

    expect(conflict.body).toEqual({
      error: {
        code: "REQUEST_CONFLICT",
        message: "Idempotency key was already used for another request",
        requestId: "sc_req_1",
      },
    });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("returns structured not-found errors", async () => {
    const { app } = setup();

    await request(app).get("/v1/requests/missing").expect(404, {
      error: {
        code: "NOT_FOUND",
        message: "Verification request was not found",
      },
    });
    await request(app).get("/v1/receipts/missing").expect(404, {
      error: {
        code: "NOT_FOUND",
        message: "Acceptance receipt was not found",
      },
    });
    await request(app).get("/v1/reports/missing").expect(404, {
      error: {
        code: "NOT_FOUND",
        message: "Report was not found",
      },
    });
  });

  it("serves a persisted report bundle after verification", async () => {
    const { app } = setup();

    await request(app).post("/v1/verify").send(verifyInput).expect(200);
    const report = await request(app).get("/v1/reports/receipt_1").expect(200);

    expect(report.body).toMatchObject({
      receiptId: "receipt_1",
      verdict: "ACCEPTED",
      summary: receipt.summary,
    });
  });

  it("rejects verification when the incident gate disables it", async () => {
    const { app, verify } = setup({ verificationEnabled: false });

    await request(app).post("/v1/verify").send(verifyInput).expect(503, {
      error: {
        code: "EXECUTION_UNAVAILABLE",
        message: "Verification is temporarily disabled",
      },
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it("does not expose unexpected internal error details", async () => {
    const { app } = setup({
      verify: () => Promise.reject(new Error("database password leaked")),
    });

    const failed = await request(app)
      .post("/v1/verify")
      .send(verifyInput)
      .expect(500);

    expect(failed.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected service failure",
        requestId: "sc_req_1",
      },
    });
    expect(JSON.stringify(failed.body)).not.toContain("password");
  });

  it("maps declared service errors without losing their status", async () => {
    const { app } = setup({
      compile: () =>
        Promise.reject(
          new ServiceError(
          422,
          "COMPILATION_FAILED",
          "No valid acceptance contract could be compiled",
          ),
        ),
    });

    await request(app).post("/v1/compile").send(verifyInput).expect(422, {
      error: {
        code: "COMPILATION_FAILED",
        message: "No valid acceptance contract could be compiled",
      },
    });
  });
});
