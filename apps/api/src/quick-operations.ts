import { aggregateRequirementResults } from "@shipcheck/acceptance-policy";
import type {
  AcceptancePolicy,
  VerifyRequest,
} from "@shipcheck/domain";
import {
  buildAcceptanceBundle,
  type ArtifactSink,
} from "@shipcheck/evidence-store";
import {
  planExecution,
  type ExecutionPolicy,
} from "@shipcheck/execution-planner";
import { UrlPolicyError, type PublicWebWorker } from "@shipcheck/public-web-adapter";
import {
  RequirementCompilationError,
  compileRequirements,
  type RequirementCompilerOptions,
} from "@shipcheck/requirement-compiler";
import {
  VerifyResponseSchema,
} from "@shipcheck/service-core";
import type {
  ShipCheckMetrics,
  StructuredLogger,
} from "@shipcheck/service-ops";

import {
  ServiceError,
  type VerificationOperations,
  type VerifyOperationResult,
} from "./app.js";
import { buildReportUrl } from "./report-url.js";
import { createVerifyStageLogger } from "./verify-stage-log.js";

export interface QuickVerificationOptions {
  readonly compiler: RequirementCompilerOptions;
  readonly executionPolicy: ExecutionPolicy;
  readonly acceptancePolicy: AcceptancePolicy;
  readonly worker: Pick<PublicWebWorker, "executeWithEvidence">;
  readonly artifactSink: ArtifactSink;
  readonly adapterVersion: string;
  readonly createReceiptId: () => string;
  readonly now: () => string;
  readonly totalTimeoutMs: number;
  readonly reportBaseUrl?: string;
  readonly browserExecutionEnabled?: boolean;
  readonly metrics?: ShipCheckMetrics;
  readonly logger?: StructuredLogger;
}

function withTotalTimeout<T>(
  startWork: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const error = new ServiceError(
        503,
        "EXECUTION_UNAVAILABLE",
        "Quick verification exceeded its total time budget",
      );
      controller.abort(error);
      reject(error);
    }, timeoutMs);
    timer.unref();
    void startWork(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("Verification failed"));
      },
    );
  });
}

export function createQuickVerificationOperations(
  options: QuickVerificationOptions,
): VerificationOperations {
  if (
    !Number.isFinite(options.totalTimeoutMs) ||
    options.totalTimeoutMs <= 0
  ) {
    throw new TypeError("totalTimeoutMs must be a positive finite number");
  }
  const browserExecutionEnabled = options.browserExecutionEnabled ?? true;

  const compile = async (input: VerifyRequest) => {
    try {
      const contract = await compileRequirements(input, options.compiler);
      const executableCount = contract.requirements.filter(
        (requirement) => requirement.class === "EXECUTABLE",
      ).length;
      options.metrics?.recordContractStats({
        requirements: contract.requirements.length,
        executableRatio:
          contract.requirements.length === 0
            ? 0
            : executableCount / contract.requirements.length,
      });
      return contract;
    } catch (error) {
      if (error instanceof RequirementCompilationError) {
        options.metrics?.recordCompilerFailure();
      } else if (error instanceof Error) {
        options.logger?.error("compile.failed", {
          message: error.message,
          stage: "compiler",
        });
        throw new ServiceError(
          503,
          "EXECUTION_UNAVAILABLE",
          "Requirement compiler is temporarily unavailable",
        );
      }
      throw error;
    }
  };

  return {
    compile,
    verify(input, requestId): Promise<VerifyOperationResult> {
      if (!browserExecutionEnabled) {
        throw new ServiceError(
          503,
          "EXECUTION_UNAVAILABLE",
          "Browser execution is temporarily disabled",
        );
      }
      const startedAt = Date.now();
      const stages = createVerifyStageLogger({
        requestId,
        startedAt,
        logger: options.logger,
      });
      const run = async (signal: AbortSignal): Promise<VerifyOperationResult> => {
        stages.logStage("compiler_started");
        let contract;
        try {
          contract = await compileRequirements(
            input,
            options.compiler,
            signal,
          );
        } catch (error) {
          if (error instanceof RequirementCompilationError) {
            options.metrics?.recordCompilerFailure();
          } else if (error instanceof Error) {
            options.logger?.error("verify.compiler_failed", {
              requestId,
              message: error.message,
              stage: "compiler",
            });
            throw new ServiceError(
              503,
              "EXECUTION_UNAVAILABLE",
              "Requirement compiler is temporarily unavailable",
            );
          }
          throw error;
        }
        stages.logStage("compiler_completed", {
          requirementCount: contract.requirements.length,
        });
        const executableCount = contract.requirements.filter(
          (requirement) => requirement.class === "EXECUTABLE",
        ).length;
        options.metrics?.recordContractStats({
          requirements: contract.requirements.length,
          executableRatio:
            contract.requirements.length === 0
              ? 0
              : executableCount / contract.requirements.length,
        });
        const plan = planExecution(contract, options.executionPolicy);
        let execution;
        try {
          execution = await options.worker.executeWithEvidence(
            { ...plan, signal },
            {
              artifactSink: options.artifactSink,
              now: options.now,
              onStage: (stage, extra = {}) => {
                stages.logStage(stage, extra);
              },
            },
          );
        } catch (error) {
          if (error instanceof UrlPolicyError) {
            options.metrics?.recordSsrfBlock();
          }
          throw error;
        }
        const results = aggregateRequirementResults(
          contract,
          plan.checks,
          execution.observations,
        );
        const passed = results.filter(
          (result) => result.status === "PASS",
        ).length;
        const failed = results.filter(
          (result) => result.status === "FAIL",
        ).length;
        stages.logStage("checks_completed", { passed, failed });
        const receiptId = options.createReceiptId();
        const testedAt = options.now();
        const bundle = buildAcceptanceBundle({
          receiptId,
          contract,
          targetFingerprint: execution.targetFingerprint,
          adapterVersion: options.adapterVersion,
          policy: options.acceptancePolicy,
          executionStatus:
            execution.executionStatus === "COMPLETED"
              ? "COMPLETED"
              : "SYSTEMIC_FAILURE",
          results,
          artifacts: execution.artifacts,
          testedAt,
        });
        stages.logStage("receipt_created", {
          receiptId: bundle.receipt.receiptId,
        });
        const response = VerifyResponseSchema.parse({
          requestId,
          contract,
          verdict: bundle.receipt.verdict,
          summary: bundle.receipt.summary,
          results,
          receipt: bundle.receipt,
          ...(options.reportBaseUrl === undefined
            ? {}
            : {
                reportUrl: buildReportUrl(
                  options.reportBaseUrl,
                  bundle.receipt.receiptId,
                ),
              }),
        });
        const evidenceBytes = execution.artifacts.reduce(
          (total, artifact) => total + artifact.sizeBytes,
          0,
        );
        options.metrics?.recordEvidenceBytes(evidenceBytes);
        options.metrics?.recordBlockedAction(execution.blockedRequests);
        if (
          execution.executionStatus !== "COMPLETED" ||
          execution.browserClosed ||
          execution.contextClosed
        ) {
          options.metrics?.recordBrowserCrash();
        }
        options.metrics?.recordVerdict(bundle.receipt.verdict);
        options.metrics?.recordRunDuration(Date.now() - startedAt);
        options.logger?.info("verify.completed", {
          requestId,
          receiptId: bundle.receipt.receiptId,
          verdict: bundle.receipt.verdict,
          stage: "verify",
          durationMs: Date.now() - startedAt,
        });
        return {
          response,
          reportBundle: {
            receiptId: bundle.receipt.receiptId,
            contract,
            results,
            receipt: bundle.receipt,
            evidenceManifest: bundle.evidenceManifest,
            createdAt: testedAt,
          },
        };
      };
      return withTotalTimeout(run, options.totalTimeoutMs).catch((error: unknown) => {
        stages.logFailure(error);
        throw error;
      });
    },
  };
}
