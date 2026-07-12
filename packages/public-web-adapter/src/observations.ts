import {
  EvidenceIdSchema,
  ObservationSchema,
  sha256Canonical,
  type Observation,
} from "@shipcheck/domain";

import type { CheckExecutionResult } from "./worker.js";

const observationStatus = {
  SATISFIED: "OBSERVED_TRUE",
  CONTRADICTED: "OBSERVED_FALSE",
  INCONCLUSIVE: "INCONCLUSIVE",
  EXECUTION_ERROR: "EXECUTION_ERROR",
} as const;

export function normalizeCheckResult(
  checkResult: CheckExecutionResult,
  evidenceIds: readonly string[],
  observedAt: string,
): Observation {
  const status = observationStatus[checkResult.status];
  const orderedEvidenceIds = [...new Set(evidenceIds)]
    .sort((left, right) => left.localeCompare(right))
    .map((id) => EvidenceIdSchema.parse(id));
  const observationId = `obs_${sha256Canonical({
    checkId: checkResult.checkId,
    observedAt,
    status,
  }).slice(0, 24)}`;

  return ObservationSchema.parse({
    observationId,
    checkId: checkResult.checkId,
    status,
    observedAt,
    summary: checkResult.summary,
    facts: checkResult.facts,
    evidenceIds: orderedEvidenceIds,
  });
}
