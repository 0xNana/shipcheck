import {
  AcceptanceContractSchema,
  CheckIdSchema,
  sha256Canonical,
  type AcceptanceContract,
  type CheckIntent,
  type Requirement,
} from "@shipcheck/domain";

import {
  ExecutionPlanSchema,
  ExecutionPolicySchema,
  PlannedCheckSchema,
  type ExecutionPlan,
  type ExecutionPolicy,
  type PlannedCheck,
} from "./schemas.js";

type PlanningErrorCode =
  | "EXECUTION_POLICY_MISMATCH"
  | "EXECUTION_LIMIT_EXCEEDED";

export class ExecutionPlanningError extends Error {
  constructor(
    readonly code: PlanningErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExecutionPlanningError";
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported check intent: ${String(value)}`);
}

function normalizeSemanticTarget(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function semanticTargetFor(
  requirement: Extract<Requirement, { class: "EXECUTABLE" }>,
): string {
  return normalizeSemanticTarget(
    requirement.provenance.kind === "BRIEF_SPAN"
      ? requirement.provenance.sourceText
      : requirement.statement,
  );
}

function checkIdFor(
  contractHash: string,
  requirementId: string,
  intent: CheckIntent,
): ReturnType<typeof CheckIdSchema.parse> {
  return CheckIdSchema.parse(
    `check_${sha256Canonical({ contractHash, intent, requirementId }).slice(0, 24)}`,
  );
}

function planCheck(
  requirement: Extract<Requirement, { class: "EXECUTABLE" }>,
  contractHash: string,
  policy: ExecutionPolicy,
): PlannedCheck {
  const base = {
    checkId: checkIdFor(contractHash, requirement.id, requirement.intent),
    requirementId: requirement.id,
    adapter: "PUBLIC_WEB" as const,
  };
  const semanticTarget = semanticTargetFor(requirement);

  switch (requirement.intent) {
    case "CONTENT_PRESENT":
    case "SECTION_PRESENT":
    case "LINK_RESOLVES":
    case "CTA_NAVIGATES":
      return PlannedCheckSchema.parse({
        ...base,
        intent: requirement.intent,
        parameters: { semanticTarget },
      });
    case "FORM_ACCEPTS_INPUT":
      return PlannedCheckSchema.parse({
        ...base,
        intent: requirement.intent,
        parameters: {
          semanticTarget,
          inputProfile: "SAFE_TEST_EMAIL",
          successSignals: [
            "VISIBLE_CONFIRMATION",
            "SUCCESSFUL_SAME_ORIGIN_RESPONSE",
          ],
        },
      });
    case "NAVIGATION_WORKS":
      return PlannedCheckSchema.parse({
        ...base,
        intent: requirement.intent,
        parameters: { semanticTarget, viewports: ["DESKTOP", "MOBILE"] },
      });
    case "NO_HORIZONTAL_OVERFLOW":
      return PlannedCheckSchema.parse({
        ...base,
        intent: requirement.intent,
        parameters: {
          viewports: ["DESKTOP", "MOBILE"],
          tolerancePixels: 1,
        },
      });
    case "ASSETS_LOAD":
      return PlannedCheckSchema.parse({
        ...base,
        intent: requirement.intent,
        parameters: { requiredImagesOnly: true },
      });
    case "NO_SEVERE_CONSOLE_ERRORS":
      return PlannedCheckSchema.parse({
        ...base,
        intent: requirement.intent,
        parameters: { minimumLevel: "ERROR" },
      });
    case "NO_FAILED_SAME_ORIGIN_REQUESTS":
      return PlannedCheckSchema.parse({
        ...base,
        intent: requirement.intent,
        parameters: {
          failureStatusThreshold: policy.sameOriginNetworkFailureThreshold,
        },
      });
    case "HTTPS_ENABLED":
      return PlannedCheckSchema.parse({
        ...base,
        intent: requirement.intent,
        parameters: {},
      });
    case "METADATA_PRESENT":
      return PlannedCheckSchema.parse({
        ...base,
        intent: requirement.intent,
        parameters: { fields: ["TITLE", "DESCRIPTION"] },
      });
    case "BASIC_ACCESSIBILITY":
      return PlannedCheckSchema.parse({
        ...base,
        intent: requirement.intent,
        parameters: {
          checks: [
            "DOCUMENT_LANGUAGE",
            "PAGE_TITLE",
            "IMAGE_ALT",
            "FORM_LABELS",
          ],
        },
      });
    default:
      return assertNever(requirement.intent);
  }
}

export function planExecution(
  contractInput: AcceptanceContract,
  policyInput: ExecutionPolicy,
): ExecutionPlan {
  const contract = AcceptanceContractSchema.parse(contractInput);
  const policy = ExecutionPolicySchema.parse(policyInput);
  if (contract.executionPolicyVersion !== policy.policyVersion) {
    throw new ExecutionPlanningError(
      "EXECUTION_POLICY_MISMATCH",
      "Contract and execution policy versions do not match",
    );
  }

  const executableRequirements = contract.requirements.filter(
    (requirement): requirement is Extract<Requirement, { class: "EXECUTABLE" }> =>
      requirement.class === "EXECUTABLE",
  );
  if (
    executableRequirements.length > policy.maxExecutableRequirementsQuick
  ) {
    throw new ExecutionPlanningError(
      "EXECUTION_LIMIT_EXCEEDED",
      `Contract exceeds the executable requirement limit of ${String(policy.maxExecutableRequirementsQuick)}`,
    );
  }

  return ExecutionPlanSchema.parse({
    planVersion: "shipcheck-execution-plan-v1.0.0",
    contractHash: contract.contractHash,
    target: contract.target,
    executionPolicyVersion: policy.policyVersion,
    checks: executableRequirements.map((requirement) =>
      planCheck(requirement, contract.contractHash, policy),
    ),
  });
}
