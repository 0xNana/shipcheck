import {
  ObservationSchema,
  type AcceptancePolicy,
  type VerifyRequest,
} from "@shipcheck/domain";
import type { ArtifactSink } from "@shipcheck/evidence-store";
import type { ExecutionPolicy } from "@shipcheck/execution-planner";
import type { PublicWebWorker } from "@shipcheck/public-web-adapter";
import type { RequirementCompilerModel } from "@shipcheck/requirement-compiler";
import { describe, expect, it } from "vitest";

import { createQuickVerificationOperations } from "../src/index.js";

const input: VerifyRequest = {
  brief: "Build a launch page with pricing.",
  deliveryUrl: "https://example.com/",
  mode: "quick",
  maxRequirements: 12,
};

const executionPolicy: ExecutionPolicy = {
  policyVersion: "execution-v1",
  allowedSchemes: ["https"],
  allowedPorts: [443],
  maxRedirects: 5,
  maxPages: 3,
  maxPopups: 1,
  desktopViewport: { width: 1440, height: 900 },
  mobileViewport: { width: 375, height: 812 },
  maxRequirements: 12,
  maxExecutableRequirementsQuick: 8,
  blockedActionClasses: [
    "AUTHENTICATION",
    "PAYMENT",
    "WALLET",
    "DESTRUCTIVE",
    "FILE_UPLOAD",
    "PERMISSION_GRANT",
    "DOWNLOAD_EXECUTABLE",
  ],
  captureTraceOn: ["FAIL", "EXECUTION_ERROR"],
  sameOriginNetworkFailureThreshold: 400,
};

const acceptancePolicy: AcceptancePolicy = {
  policyVersion: "policy-v1",
  minimumExecutableRequiredForAcceptance: 1,
  precedence: [
    { condition: "SYSTEMIC_EXECUTION_FAILURE", verdict: "EXECUTION_INCOMPLETE" },
    { condition: "NO_EXECUTABLE_REQUIREMENTS", verdict: "INSUFFICIENT_SPECIFICATION" },
    { condition: "ANY_CRITICAL_FAIL", verdict: "CHANGES_REQUIRED" },
    { condition: "ANY_REQUIRED_FAIL", verdict: "CHANGES_REQUIRED" },
    { condition: "ANY_CRITICAL_UNVERIFIED", verdict: "EXECUTION_INCOMPLETE" },
    { condition: "ANY_REQUIRED_UNVERIFIED", verdict: "ACCEPTED_WITH_NOTES" },
    { condition: "ANY_NON_PASS_RESULT", verdict: "ACCEPTED_WITH_NOTES" },
    { condition: "OTHERWISE", verdict: "ACCEPTED" },
  ],
  notes: [],
};

describe("quick verification orchestration", () => {
  it("compiles, plans, executes, aggregates, and builds a verifiable receipt", async () => {
    const model: RequirementCompilerModel = {
      generate: () =>
        Promise.resolve({
          requirements: [
            {
              id: "req_pricing",
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
        }),
    };
    const worker = {
      executeWithEvidence: (
        request: Parameters<PublicWebWorker["executeWithEvidence"]>[0],
        capture?: Parameters<PublicWebWorker["executeWithEvidence"]>[1],
      ) => {
        const check = request.checks[0];
        if (check === undefined) throw new Error("Expected one planned check");
        capture?.onStage?.("browser_started");
        capture?.onStage?.("navigation_completed", {
          url: "https://example.com/",
        });
        return Promise.resolve({
          executionStatus: "COMPLETED" as const,
          targetFingerprint: {
            finalUrl: "https://example.com/",
            sha256: "b".repeat(64),
          },
          results: [
            {
              checkId: check.checkId,
              status: "SATISFIED" as const,
              summary: "Expected section heading is visible.",
              facts: { visible: true },
            },
          ],
          blockedRequests: 0,
          contextClosed: true,
          browserClosed: true,
          observations: [
            ObservationSchema.parse({
              observationId: `obs_${check.checkId}`,
              checkId: check.checkId,
              status: "OBSERVED_TRUE" as const,
              observedAt: "2026-07-12T20:00:00.000Z",
              summary: "Expected section heading is visible.",
              facts: { visible: true },
              evidenceIds: [],
            }),
          ],
          artifacts: [],
          temporaryFilesCleaned: true,
        });
      },
    };
    const artifactSink: ArtifactSink = {
      write: () => Promise.reject(new Error("No artifact expected")),
    };
    const stageEvents: string[] = [];
    const logger = {
      log: (
        _level: string,
        _message: string,
        fields: Record<string, unknown> = {},
      ) => {
        if (typeof fields["stage"] === "string") {
          stageEvents.push(fields["stage"]);
        }
      },
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    };
    const operations = createQuickVerificationOperations({
      compiler: {
        model,
        compilerVersion: "compiler-v1",
        policyVersion: acceptancePolicy.policyVersion,
        executionPolicyVersion: executionPolicy.policyVersion,
        createContractId: () => "contract_1",
        now: () => "2026-07-12T20:00:00.000Z",
      },
      executionPolicy,
      acceptancePolicy,
      worker,
      artifactSink,
      adapterVersion: "adapter-v1",
      createReceiptId: () => "receipt_1",
      now: () => "2026-07-12T20:00:01.000Z",
      totalTimeoutMs: 1_000,
      logger,
    });

    const response = await operations.verify(input, "sc_req_1");

    expect(response.response.requestId).toBe("sc_req_1");
    expect(response.response.verdict).toBe("ACCEPTED");
    expect(response.response.results[0]?.status).toBe("PASS");
    expect(response.response.receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(response.reportBundle.receipt.receiptId).toBe("receipt_1");
    expect(stageEvents).toEqual([
      "compiler_started",
      "compiler_completed",
      "browser_started",
      "navigation_completed",
      "checks_completed",
      "receipt_created",
    ]);
    await expect(operations.compile(input)).resolves.toMatchObject({
      schemaVersion: "shipcheck-acceptance-contract-v1.0.0",
    });
  });

  it("bounds the complete billable flow by a total wall-clock timeout", async () => {
    let executionAborted = false;
    const model: RequirementCompilerModel = {
      generate: () =>
        Promise.resolve({
          requirements: [
            {
              id: "req_pricing",
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
        }),
    };
    const operations = createQuickVerificationOperations({
      compiler: {
        model,
        compilerVersion: "compiler-v1",
        policyVersion: acceptancePolicy.policyVersion,
        executionPolicyVersion: executionPolicy.policyVersion,
        createContractId: () => "contract_1",
        now: () => "2026-07-12T20:00:00.000Z",
      },
      executionPolicy,
      acceptancePolicy,
      worker: {
        executeWithEvidence: (request) =>
          new Promise((_resolve, reject) => {
            if (request.signal === undefined) {
              reject(new Error("Expected an execution abort signal"));
              return;
            }
            const signal = request.signal;
            signal.addEventListener(
              "abort",
              () => {
                executionAborted = true;
                reject(
                  signal.reason instanceof Error
                    ? signal.reason
                    : new Error("Execution aborted"),
                );
              },
              { once: true },
            );
          }),
      },
      artifactSink: {
        write: () => Promise.reject(new Error("No artifact expected")),
      },
      adapterVersion: "adapter-v1",
      createReceiptId: () => "receipt_1",
      now: () => "2026-07-12T20:00:01.000Z",
      totalTimeoutMs: 10,
    });

    await expect(operations.verify(input, "sc_req_1")).rejects.toMatchObject({
      code: "EXECUTION_UNAVAILABLE",
      status: 503,
    });
    expect(executionAborted).toBe(true);
  });
});
