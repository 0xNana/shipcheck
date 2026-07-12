import {
  RequirementResultSchema,
  type AcceptanceContract,
  type CheckDefinition,
  type Observation,
  type Requirement,
  type RequirementResult,
} from "@shipcheck/domain";

function compareIds(left: string, right: string): number {
  return left.localeCompare(right);
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(compareIds);
}

function nonExecutableResult(
  requirement: Exclude<Requirement, { class: "EXECUTABLE" }>,
): RequirementResult {
  return RequirementResultSchema.parse({
    requirementId: requirement.id,
    priority: requirement.priority,
    status:
      requirement.class === "SUBJECTIVE"
        ? "NOT_OBJECTIVELY_TESTABLE"
        : "UNSUPPORTED",
    checkIds: [],
    observationIds: [],
    evidenceIds: [],
    expected: requirement.statement,
    rerunEligible: false,
  });
}

export function aggregateRequirementResult(
  requirement: Requirement,
  checks: readonly CheckDefinition[],
  observations: readonly Observation[],
): RequirementResult {
  if (requirement.class !== "EXECUTABLE") {
    if (checks.length > 0 || observations.length > 0) {
      throw new TypeError(
        `Only executable requirement ${requirement.id} may have checks or observations`,
      );
    }
    return nonExecutableResult(requirement);
  }

  const orderedChecks = [...checks].sort((left, right) =>
    compareIds(left.checkId, right.checkId),
  );
  const checkIds = orderedChecks.map(({ checkId }) => checkId);

  if (orderedChecks.length === 0) {
    return RequirementResultSchema.parse({
      requirementId: requirement.id,
      priority: requirement.priority,
      status: "UNSUPPORTED",
      checkIds: [],
      observationIds: [],
      evidenceIds: [],
      expected: requirement.statement,
      rerunEligible: false,
    });
  }

  const observationsByCheck = new Map<string, Observation[]>();
  for (const check of orderedChecks) {
    if (check.requirementId !== requirement.id) {
      throw new TypeError(
        `Check ${check.checkId} does not belong to requirement ${requirement.id}`,
      );
    }
    if (check.intent !== requirement.intent) {
      throw new TypeError(
        `Check ${check.checkId} intent does not match requirement ${requirement.id}`,
      );
    }
    if (observationsByCheck.has(check.checkId)) {
      throw new TypeError(`Duplicate check ID: ${check.checkId}`);
    }
    observationsByCheck.set(check.checkId, []);
  }

  for (const observation of observations) {
    const matching = observationsByCheck.get(observation.checkId);
    if (matching !== undefined) {
      matching.push(observation);
    }
  }

  const relevantObservations = [...observationsByCheck.values()]
    .flat()
    .sort(
      (left, right) =>
        compareIds(left.checkId, right.checkId) ||
        compareIds(left.observationId, right.observationId),
    );
  const observationIds = relevantObservations.map(
    ({ observationId }) => observationId,
  );
  const evidenceIds = sortedUnique(
    relevantObservations.flatMap(({ evidenceIds: ids }) => ids),
  );
  const observed = relevantObservations
    .map(({ checkId, summary }) => `${checkId}: ${summary}`)
    .join("; ");

  const hasContradiction = relevantObservations.some(
    ({ status }) => status === "OBSERVED_FALSE",
  );
  const hasIncompleteCheck = orderedChecks.some((check) => {
    const matching = observationsByCheck.get(check.checkId);
    return (
      matching?.length !== 1 ||
      matching[0]?.status === "INCONCLUSIVE" ||
      matching[0]?.status === "EXECUTION_ERROR"
    );
  });

  const status = hasContradiction
    ? "FAIL"
    : hasIncompleteCheck
      ? "UNVERIFIED"
      : "PASS";

  return RequirementResultSchema.parse({
    requirementId: requirement.id,
    priority: requirement.priority,
    status,
    checkIds,
    observationIds,
    evidenceIds,
    expected: requirement.statement,
    ...(observed.length > 0 ? { observed } : {}),
    ...(status === "FAIL"
      ? { repairHint: "Review the contradicted acceptance checks." }
      : {}),
    rerunEligible: status === "FAIL" || status === "UNVERIFIED",
  });
}

export function aggregateRequirementResults(
  contract: AcceptanceContract,
  checks: readonly CheckDefinition[],
  observations: readonly Observation[],
): RequirementResult[] {
  const requirementIds = new Set(
    contract.requirements.map((requirement) => requirement.id),
  );
  const checkIds = new Set<string>();
  for (const check of checks) {
    if (!requirementIds.has(check.requirementId)) {
      throw new TypeError(
        `Check ${check.checkId} references an unknown requirement`,
      );
    }
    if (checkIds.has(check.checkId)) {
      throw new TypeError(`Duplicate check ID: ${check.checkId}`);
    }
    checkIds.add(check.checkId);
  }

  const observationIds = new Set<string>();
  for (const observation of observations) {
    if (!checkIds.has(observation.checkId)) {
      throw new TypeError(
        `Observation ${observation.observationId} references an unknown check`,
      );
    }
    if (observationIds.has(observation.observationId)) {
      throw new TypeError(
        `Duplicate observation ID: ${observation.observationId}`,
      );
    }
    observationIds.add(observation.observationId);
  }

  return contract.requirements.map((requirement) => {
    const requirementChecks = checks.filter(
      (check) => check.requirementId === requirement.id,
    );
    const requirementCheckIds = new Set(
      requirementChecks.map((check) => check.checkId),
    );
    const requirementObservations = observations.filter((observation) =>
      requirementCheckIds.has(observation.checkId),
    );

    return aggregateRequirementResult(
      requirement,
      requirementChecks,
      requirementObservations,
    );
  });
}
