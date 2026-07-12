import {
  AcceptanceContractSchema,
  AcceptancePolicySchema,
  EvidenceArtifactSchema,
  RequirementResultSchema,
  hashAcceptanceReceipt,
} from "@shipcheck/domain";
import { describe, expect, it } from "vitest";

import {
  buildAcceptanceReceipt,
  buildEvidenceManifest,
} from "../src/index.js";

const artifactA = EvidenceArtifactSchema.parse({
  id: "ev_a",
  type: "SCREENSHOT",
  sha256: "a".repeat(64),
  contentType: "image/png",
  sizeBytes: 120,
  storageUrl: "https://objects.example/signed-a",
  createdAt: "2026-07-12T10:00:00Z",
  redaction: { applied: false },
});

const artifactB = EvidenceArtifactSchema.parse({
  id: "ev_b",
  type: "TRACE",
  sha256: "b".repeat(64),
  contentType: "application/zip",
  sizeBytes: 240,
  storageUrl: "https://objects.example/signed-b",
  createdAt: "2026-07-12T10:00:01Z",
  redaction: { applied: false },
});

const contract = AcceptanceContractSchema.parse({
  schemaVersion: "shipcheck-acceptance-contract-v1.0.0",
  contractId: "contract_receipt",
  compilerVersion: "compiler-v1",
  policyVersion: "policy-v1",
  executionPolicyVersion: "execution-v1",
  target: "https://example.com",
  requirements: [
    {
      id: "req_pricing",
      statement: "A pricing section is present.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "pricing",
        start: 10,
        end: 17,
      },
      class: "EXECUTABLE",
      adapter: "PUBLIC_WEB",
      priority: "REQUIRED",
      prioritySource: "DEFAULT",
      confidence: 1,
      intent: "SECTION_PRESENT",
    },
  ],
  createdAt: "2026-07-12T09:59:00Z",
  contractHash: "c".repeat(64),
});

const passingResult = RequirementResultSchema.parse({
  requirementId: "req_pricing",
  priority: "REQUIRED",
  status: "PASS",
  checkIds: ["check_pricing"],
  observationIds: ["obs_pricing"],
  evidenceIds: ["ev_a"],
  rerunEligible: false,
});

const policy = AcceptancePolicySchema.parse({
  policyVersion: "policy-v1",
  minimumExecutableRequiredForAcceptance: 1,
  precedence: [
    {
      condition: "SYSTEMIC_EXECUTION_FAILURE",
      verdict: "EXECUTION_INCOMPLETE",
    },
    {
      condition: "NO_EXECUTABLE_REQUIREMENTS",
      verdict: "INSUFFICIENT_SPECIFICATION",
    },
    { condition: "ANY_CRITICAL_FAIL", verdict: "CHANGES_REQUIRED" },
    { condition: "ANY_REQUIRED_FAIL", verdict: "CHANGES_REQUIRED" },
    {
      condition: "ANY_CRITICAL_UNVERIFIED",
      verdict: "EXECUTION_INCOMPLETE",
    },
    {
      condition: "ANY_REQUIRED_UNVERIFIED",
      verdict: "ACCEPTED_WITH_NOTES",
    },
    { condition: "ANY_NON_PASS_RESULT", verdict: "ACCEPTED_WITH_NOTES" },
    { condition: "OTHERWISE", verdict: "ACCEPTED" },
  ],
  notes: [],
});

const receiptInput = {
  receiptId: "receipt_001",
  contract,
  targetFingerprint: {
    finalUrl: "https://example.com/",
    sha256: "d".repeat(64),
  },
  adapterVersion: "public-web-adapter-v1",
  policy,
  executionStatus: "COMPLETED" as const,
  results: [passingResult],
  artifacts: [artifactA, artifactB],
  testedAt: "2026-07-12T10:01:00Z",
};

describe("buildEvidenceManifest", () => {
  it("sorts artifacts by ID and excludes signed URLs from its hash", () => {
    const first = buildEvidenceManifest([artifactB, artifactA]);
    const second = buildEvidenceManifest([
      { ...artifactA, storageUrl: "https://objects.example/new-signature-a" },
      { ...artifactB, storageUrl: "https://objects.example/new-signature-b" },
    ]);

    expect(first.schemaVersion).toBe(
      "shipcheck-evidence-manifest-v1.0.0",
    );
    expect(first.artifacts.map(({ id }) => id)).toEqual(["ev_a", "ev_b"]);
    expect(first.evidenceManifestHash).toBe(second.evidenceManifestHash);
  });

  it("rejects duplicate evidence IDs", () => {
    expect(() => buildEvidenceManifest([artifactA, artifactA])).toThrow(
      /duplicate/i,
    );
  });
});

describe("buildAcceptanceReceipt", () => {
  it("derives versions, counts, manifest hash, and a verifiable receipt hash", () => {
    const receipt = buildAcceptanceReceipt(receiptInput);

    expect(receipt.receiptSchemaVersion).toBe(
      "shipcheck-acceptance-receipt-v1.0.0",
    );
    expect(receipt.evidenceManifestVersion).toBe(
      "shipcheck-evidence-manifest-v1.0.0",
    );
    expect(receipt.contractSchemaVersion).toBe(contract.schemaVersion);
    expect(receipt.compilerVersion).toBe(contract.compilerVersion);
    expect(receipt.executionPolicyVersion).toBe(
      contract.executionPolicyVersion,
    );
    expect(receipt.policyVersion).toBe(contract.policyVersion);
    expect(receipt.summary).toEqual({
      total: 1,
      passed: 1,
      failed: 0,
      unverified: 0,
      notObjectivelyTestable: 0,
      unsupported: 0,
    });
    expect(receipt.receiptHash).toBe(hashAcceptanceReceipt(receipt));
  });

  it("does not change when evidence signed URLs rotate", () => {
    const first = buildAcceptanceReceipt(receiptInput);
    const second = buildAcceptanceReceipt({
      ...receiptInput,
      artifacts: [
        { ...artifactA, storageUrl: "https://objects.example/rotated-a" },
        { ...artifactB, storageUrl: "https://objects.example/rotated-b" },
      ],
    });

    expect(first.evidenceManifestHash).toBe(second.evidenceManifestHash);
    expect(first.receiptHash).toBe(second.receiptHash);
  });

  it("rejects evidence references absent from the manifest", () => {
    const unknownEvidenceResult = RequirementResultSchema.parse({
      ...passingResult,
      evidenceIds: ["ev_missing"],
    });

    expect(() =>
      buildAcceptanceReceipt({
        ...receiptInput,
        results: [unknownEvidenceResult],
      }),
    ).toThrow(/evidence/i);
  });

  it("rejects a result that does not belong to the contract", () => {
    const unknownRequirementResult = RequirementResultSchema.parse({
      ...passingResult,
      requirementId: "req_unknown",
    });

    expect(() =>
      buildAcceptanceReceipt({
        ...receiptInput,
        results: [unknownRequirementResult],
      }),
    ).toThrow(/requirement/i);
  });

  it("derives the verdict instead of trusting a caller-supplied value", () => {
    const failingResult = RequirementResultSchema.parse({
      ...passingResult,
      status: "FAIL",
      rerunEligible: true,
    });

    const forgedInput = {
      ...receiptInput,
      verdict: "ACCEPTED",
      results: [failingResult],
    } as const;
    const receipt = buildAcceptanceReceipt(forgedInput);

    expect(receipt.verdict).toBe("CHANGES_REQUIRED");
  });
});
