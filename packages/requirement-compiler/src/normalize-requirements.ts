import {
  RequirementSchema,
  type Requirement,
  type RequirementProvenance,
} from "@shipcheck/domain";

const priorityRank = {
  OPTIONAL: 0,
  REQUIRED: 1,
  CRITICAL: 2,
} as const;

const prioritySourceRank = {
  DEFAULT: 0,
  INFERRED: 1,
  EXPLICIT: 2,
} as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeSurfaceText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function semanticStatementKey(statement: string): string {
  return normalizeSurfaceText(statement)
    .replace(/[.!?]+$/u, "")
    .toLowerCase();
}

function deduplicationKey(requirement: Requirement): string {
  const intent =
    requirement.class === "EXECUTABLE" ? requirement.intent : "NO_INTENT";
  return [
    requirement.class,
    intent,
    semanticStatementKey(requirement.statement),
  ].join("\u0000");
}

function compareProvenance(
  left: RequirementProvenance,
  right: RequirementProvenance,
): number {
  if (left.kind !== right.kind) {
    return left.kind === "BRIEF_SPAN" ? -1 : 1;
  }
  if (left.kind === "BRIEF_SPAN" && right.kind === "BRIEF_SPAN") {
    return (
      left.start - right.start ||
      left.end - right.end ||
      compareText(left.sourceText, right.sourceText)
    );
  }
  if (left.kind === "DERIVED_BASELINE" && right.kind === "DERIVED_BASELINE") {
    return compareText(
      normalizeSurfaceText(left.rationale),
      normalizeSurfaceText(right.rationale),
    );
  }
  return 0;
}

function mergeGroup(group: readonly Requirement[]): Requirement {
  const ordered = [...group].sort(
    (left, right) =>
      compareProvenance(left.provenance, right.provenance) ||
      compareText(
        normalizeSurfaceText(left.statement),
        normalizeSurfaceText(right.statement),
      ) ||
      compareText(left.id, right.id),
  );
  const representative = ordered[0];
  if (representative === undefined) {
    throw new TypeError("Cannot merge an empty requirement group");
  }

  const strongestPriority = [...group].sort(
    (left, right) =>
      priorityRank[right.priority] - priorityRank[left.priority] ||
      prioritySourceRank[right.prioritySource] -
        prioritySourceRank[left.prioritySource] ||
      compareText(left.id, right.id),
  )[0];
  if (strongestPriority === undefined) {
    throw new TypeError("Cannot resolve priority for an empty group");
  }

  const clarification = group
    .flatMap((requirement) =>
      requirement.clarification === undefined
        ? []
        : [normalizeSurfaceText(requirement.clarification)],
    )
    .sort(compareText)[0];
  const merged = { ...representative };
  delete merged.clarification;

  return RequirementSchema.parse({
    ...merged,
    id: [...group].map(({ id }) => id).sort(compareText)[0],
    statement: normalizeSurfaceText(representative.statement),
    provenance: representative.provenance,
    priority: strongestPriority.priority,
    prioritySource: strongestPriority.prioritySource,
    confidence: Math.max(...group.map(({ confidence }) => confidence)),
    ...(clarification === undefined ? {} : { clarification }),
  });
}

export function normalizeAndDeduplicateRequirements(
  requirements: readonly Requirement[],
): Requirement[] {
  const groups = new Map<string, Requirement[]>();
  for (const requirement of requirements) {
    const validated = RequirementSchema.parse(requirement);
    const key = deduplicationKey(validated);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [validated]);
    } else {
      group.push(validated);
    }
  }

  return [...groups.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, group]) => mergeGroup(group));
}
