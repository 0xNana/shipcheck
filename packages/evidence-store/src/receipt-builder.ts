import { determineAcceptance } from "@shipcheck/acceptance-policy";
import {
  AcceptanceReceiptSchema,
  hashAcceptanceReceipt,
  type AcceptanceContract,
  type AcceptanceReceipt,
  type AcceptancePolicy,
  type EvidenceArtifact,
  type ExecutionStatus,
  type RequirementResult,
} from "@shipcheck/domain";

import { buildEvidenceManifest } from "./evidence-manifest.js";

export interface BuildAcceptanceReceiptInput {
  readonly receiptId: string;
  readonly contract: AcceptanceContract;
  readonly targetFingerprint: {
    readonly finalUrl: string;
    readonly sha256: string;
  };
  readonly adapterVersion: string;
  readonly policy: AcceptancePolicy;
  readonly executionStatus: ExecutionStatus;
  readonly results: readonly RequirementResult[];
  readonly artifacts: readonly EvidenceArtifact[];
  readonly testedAt: string;
}

function orderAndValidateResults(
  contract: AcceptanceContract,
  results: readonly RequirementResult[],
): RequirementResult[] {
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

  return contract.requirements.map((requirement) => {
    const result = byRequirement.get(requirement.id);
    if (result === undefined) {
      throw new TypeError(
        `Missing result for contract requirement ${requirement.id}`,
      );
    }
    if (result.priority !== requirement.priority) {
      throw new TypeError(
        `Result priority does not match requirement ${requirement.id}`,
      );
    }
    return result;
  });
}

function summarize(results: readonly RequirementResult[]) {
  return {
    total: results.length,
    passed: results.filter(({ status }) => status === "PASS").length,
    failed: results.filter(({ status }) => status === "FAIL").length,
    unverified: results.filter(({ status }) => status === "UNVERIFIED").length,
    notObjectivelyTestable: results.filter(
      ({ status }) => status === "NOT_OBJECTIVELY_TESTABLE",
    ).length,
    unsupported: results.filter(({ status }) => status === "UNSUPPORTED")
      .length,
  };
}

export function buildAcceptanceReceipt(
  input: BuildAcceptanceReceiptInput,
): AcceptanceReceipt {
  const manifest = buildEvidenceManifest(input.artifacts);
  const results = orderAndValidateResults(input.contract, input.results);
  const verdict = determineAcceptance(
    input.contract,
    results,
    input.policy,
    input.executionStatus,
  );
  const evidenceIds = new Set(
    manifest.artifacts.map((artifact) => artifact.id),
  );

  for (const result of results) {
    for (const evidenceId of result.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        throw new TypeError(
          `Result references evidence absent from manifest: ${evidenceId}`,
        );
      }
    }
  }

  const receiptBody = {
    receiptSchemaVersion: "shipcheck-acceptance-receipt-v1.0.0" as const,
    receiptId: input.receiptId,
    contractHash: input.contract.contractHash,
    contractSchemaVersion: input.contract.schemaVersion,
    target: input.contract.target,
    targetFingerprint: input.targetFingerprint,
    compilerVersion: input.contract.compilerVersion,
    executionPolicyVersion: input.contract.executionPolicyVersion,
    adapterVersion: input.adapterVersion,
    evidenceManifestVersion: manifest.schemaVersion,
    verdict,
    summary: summarize(results),
    results,
    evidenceManifestHash: manifest.evidenceManifestHash,
    policyVersion: input.contract.policyVersion,
    testedAt: input.testedAt,
  };

  return AcceptanceReceiptSchema.parse({
    ...receiptBody,
    receiptHash: hashAcceptanceReceipt(receiptBody),
  });
}
