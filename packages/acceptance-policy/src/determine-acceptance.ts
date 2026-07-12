import {
  type AcceptanceContract,
  type AcceptancePolicy,
  type ExecutionStatus,
  type OverallVerdict,
  type Requirement,
  type RequirementResult,
} from "@shipcheck/domain";

function validateResultCompatibility(
  requirement: Requirement,
  result: RequirementResult,
): void {
  if (result.priority !== requirement.priority) {
    throw new TypeError(
      `Result priority does not match requirement ${requirement.id}`,
    );
  }

  if (
    (result.status === "PASS" || result.status === "FAIL") &&
    (result.checkIds.length === 0 || result.observationIds.length === 0)
  ) {
    throw new TypeError(
      `A ${result.status} result requires check and observation references`,
    );
  }

  if (
    requirement.class === "SUBJECTIVE" &&
    result.status !== "NOT_OBJECTIVELY_TESTABLE"
  ) {
    throw new TypeError(
      `Subjective requirement ${requirement.id} must be not objectively testable`,
    );
  }

  if (
    (requirement.class === "AMBIGUOUS" ||
      requirement.class === "UNSUPPORTED") &&
    result.status !== "UNSUPPORTED"
  ) {
    throw new TypeError(
      `${requirement.class} requirement ${requirement.id} must be unsupported`,
    );
  }

  if (
    requirement.class === "EXECUTABLE" &&
    result.status === "NOT_OBJECTIVELY_TESTABLE"
  ) {
    throw new TypeError(
      `Executable requirement ${requirement.id} cannot be not objectively testable`,
    );
  }
}

function validateResults(
  contract: AcceptanceContract,
  results: readonly RequirementResult[],
): void {
  const byRequirement = new Map<string, RequirementResult>();
  for (const result of results) {
    if (byRequirement.has(result.requirementId)) {
      throw new TypeError(
        `Duplicate result for requirement ${result.requirementId}`,
      );
    }
    byRequirement.set(result.requirementId, result);
  }

  if (results.length !== contract.requirements.length) {
    throw new TypeError("Exactly one result is required for every requirement");
  }

  for (const requirement of contract.requirements) {
    const result = byRequirement.get(requirement.id);
    if (result === undefined) {
      throw new TypeError(`Missing result for requirement ${requirement.id}`);
    }
    validateResultCompatibility(requirement, result);
  }
}

function conditionMatches(
  condition: AcceptancePolicy["precedence"][number]["condition"],
  contract: AcceptanceContract,
  results: readonly RequirementResult[],
  policy: AcceptancePolicy,
  executionStatus: ExecutionStatus,
): boolean {
  switch (condition) {
    case "SYSTEMIC_EXECUTION_FAILURE":
      return executionStatus === "SYSTEMIC_FAILURE";
    case "NO_EXECUTABLE_REQUIREMENTS":
      return (
        contract.requirements.filter(
          (requirement) => requirement.class === "EXECUTABLE",
        ).length < policy.minimumExecutableRequiredForAcceptance
      );
    case "ANY_CRITICAL_FAIL":
      return results.some(
        (result) =>
          result.priority === "CRITICAL" && result.status === "FAIL",
      );
    case "ANY_REQUIRED_FAIL":
      return results.some(
        (result) =>
          result.priority === "REQUIRED" && result.status === "FAIL",
      );
    case "ANY_CRITICAL_UNVERIFIED":
      return results.some(
        (result) =>
          result.priority === "CRITICAL" && result.status === "UNVERIFIED",
      );
    case "ANY_REQUIRED_UNVERIFIED":
      return results.some(
        (result) =>
          result.priority === "REQUIRED" && result.status === "UNVERIFIED",
      );
    case "ANY_NON_PASS_RESULT":
      return results.some((result) => result.status !== "PASS");
    case "OTHERWISE":
      return true;
  }
}

export function determineAcceptance(
  contract: AcceptanceContract,
  results: readonly RequirementResult[],
  policy: AcceptancePolicy,
  executionStatus: ExecutionStatus,
): OverallVerdict {
  if (contract.policyVersion !== policy.policyVersion) {
    throw new TypeError("Contract and acceptance policy versions do not match");
  }
  validateResults(contract, results);

  for (const rule of policy.precedence) {
    if (
      conditionMatches(
        rule.condition,
        contract,
        results,
        policy,
        executionStatus,
      )
    ) {
      return rule.verdict;
    }
  }

  throw new TypeError("Acceptance policy has no matching precedence rule");
}
