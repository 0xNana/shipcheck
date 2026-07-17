import {
  AcceptanceContractSchema,
  RequirementSchema,
  hashAcceptanceContract,
  type AcceptanceContract,
  type CheckIntent,
  type Requirement,
} from "@shipcheck/domain";
import { describe, expect, it } from "vitest";

import {
  ExecutionPlanSchema,
  ExecutionPlanningError,
  PlannedCheckSchema,
  planExecution,
  type ExecutionPolicy,
} from "../src/index.js";

const policy: ExecutionPolicy = {
  policyVersion: "shipcheck-public-web-v1.0.0",
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

function executable(id: string, intent: CheckIntent): Requirement {
  return RequirementSchema.parse({
    id,
    statement: `Verify ${intent.toLowerCase().replaceAll("_", " ")}.`,
    provenance: {
      kind: "DERIVED_BASELINE",
      rationale: `Baseline for ${intent}.`,
    },
    class: "EXECUTABLE",
    adapter: "PUBLIC_WEB",
    priority: "OPTIONAL",
    prioritySource: "DEFAULT",
    confidence: 1,
    intent,
  });
}

function contract(requirements: Requirement[]): AcceptanceContract {
  const body = {
    schemaVersion: "shipcheck-acceptance-contract-v1.0.0" as const,
    contractId: "contract_planner",
    compilerVersion: "compiler-v1",
    policyVersion: "policy-v1",
    executionPolicyVersion: policy.policyVersion,
    target: "https://example.com/",
    requirements,
    createdAt: "2026-07-12T10:00:00Z",
  };
  return AcceptanceContractSchema.parse({
    ...body,
    contractHash: hashAcceptanceContract(body),
  });
}

describe("planExecution", () => {
  it("maps every allowed intent to a finite validated check shape", () => {
    const intents: CheckIntent[] = [
      "CONTENT_PRESENT",
      "SECTION_PRESENT",
      "LINK_RESOLVES",
      "CTA_NAVIGATES",
      "FORM_ACCEPTS_INPUT",
      "NAVIGATION_WORKS",
      "NO_HORIZONTAL_OVERFLOW",
      "ASSETS_LOAD",
      "NO_SEVERE_CONSOLE_ERRORS",
      "NO_FAILED_SAME_ORIGIN_REQUESTS",
      "HTTPS_ENABLED",
      "METADATA_PRESENT",
      "BASIC_ACCESSIBILITY",
    ];

    const plans = intents.map((intent, index) =>
      planExecution(
        contract([executable(`req_${String(index)}`, intent)]),
        policy,
      ),
    );

    expect(plans.map(({ checks }) => checks[0]?.intent)).toEqual(intents);
    for (const plan of plans) {
      expect(ExecutionPlanSchema.safeParse(plan).success).toBe(true);
      expect(PlannedCheckSchema.safeParse(plan.checks[0]).success).toBe(true);
    }
  });

  it("plans semantic checks from exact brief-span text", () => {
    const requirement = RequirementSchema.parse({
      id: "req_login",
      statement: "A Login button is present.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "Login",
        start: 28,
        end: 33,
      },
      class: "EXECUTABLE",
      adapter: "PUBLIC_WEB",
      priority: "REQUIRED",
      prioritySource: "EXPLICIT",
      confidence: 0.9,
      intent: "CONTENT_PRESENT",
    });

    const plan = planExecution(contract([requirement]), policy);

    expect(plan.checks[0]?.parameters).toEqual({ semanticTarget: "Login" });
  });

  it("never creates checks for non-executable requirements", () => {
    const subjective = RequirementSchema.parse({
      id: "req_delightful",
      statement: "The page feels delightful.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "delightful",
        start: 15,
        end: 25,
      },
      class: "SUBJECTIVE",
      priority: "REQUIRED",
      prioritySource: "EXPLICIT",
      confidence: 0.9,
    });

    expect(planExecution(contract([subjective]), policy).checks).toEqual([]);
  });

  it("is deterministic and preserves contract requirement order", () => {
    const input = contract([
      executable("req_metadata", "METADATA_PRESENT"),
      executable("req_https", "HTTPS_ENABLED"),
    ]);

    const first = planExecution(input, policy);
    const second = planExecution(input, policy);

    expect(second).toEqual(first);
    expect(first.checks.map(({ requirementId }) => requirementId)).toEqual([
      "req_metadata",
      "req_https",
    ]);
  });

  it("rejects policy version mismatches", () => {
    const input = contract([executable("req_https", "HTTPS_ENABLED")]);

    expect(() =>
      planExecution(input, { ...policy, policyVersion: "different-policy" }),
    ).toThrowError(ExecutionPlanningError);
  });

  it("rejects execution plans above the quick-mode limit", () => {
    const requirements = Array.from({ length: 9 }, (_, index) =>
      executable(`req_${String(index)}`, "HTTPS_ENABLED"),
    );

    expect(() => planExecution(contract(requirements), policy)).toThrowError(
      /exceeds the executable requirement limit/u,
    );
  });

  it("rejects unsafe or unknown parameters at the runnable boundary", () => {
    const valid = planExecution(
      contract([executable("req_content", "CONTENT_PRESENT")]),
      policy,
    ).checks[0];

    expect(
      PlannedCheckSchema.safeParse({
        ...valid,
        parameters: {
          semanticTarget: "pricing",
          selector: "body *",
          script: "document.cookie",
          url: "http://169.254.169.254/latest/meta-data",
        },
      }).success,
    ).toBe(false);
    expect(
      PlannedCheckSchema.safeParse({
        ...valid,
        intent: "ARBITRARY_JAVASCRIPT",
      }).success,
    ).toBe(false);
  });
});
