import {
  AcceptanceContractSchema,
  EvidenceArtifactSchema,
  RequirementResultSchema,
} from "@shipcheck/domain";
import { describe, expect, it } from "vitest";

import { buildAcceptanceBundle } from "../src/receipt-bundle.js";

describe("buildAcceptanceBundle", () => {
  it("returns a receipt and canonical evidence manifest together", () => {
    const artifact = EvidenceArtifactSchema.parse({
      id: "ev_abc",
      type: "SCREENSHOT",
      sha256: "a".repeat(64),
      contentType: "image/png",
      sizeBytes: 128,
      createdAt: "2026-07-12T20:00:00.000Z",
      redaction: { applied: false },
    });

    const bundle = buildAcceptanceBundle({
      receiptId: "receipt_1",
      contract: AcceptanceContractSchema.parse({
        schemaVersion: "shipcheck-acceptance-contract-v1.0.0",
        contractId: "contract_1",
        compilerVersion: "compiler-v1",
        policyVersion: "policy-v1",
        executionPolicyVersion: "execution-v1",
        target: "https://example.com/",
        requirements: [
          {
            id: "req_1",
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
        createdAt: "2026-07-12T20:00:00.000Z",
        contractHash: "b".repeat(64),
      }),
      targetFingerprint: {
        finalUrl: "https://example.com/",
        sha256: "c".repeat(64),
      },
      adapterVersion: "adapter-v1",
      policy: {
        policyVersion: "policy-v1",
        minimumExecutableRequiredForAcceptance: 1,
        precedence: [{ condition: "OTHERWISE", verdict: "ACCEPTED" }],
        notes: [],
      },
      executionStatus: "COMPLETED",
      results: [
        RequirementResultSchema.parse({
          requirementId: "req_1",
          priority: "REQUIRED",
          status: "PASS",
          checkIds: ["check_1"],
          observationIds: ["obs_1"],
          evidenceIds: ["ev_abc"],
          rerunEligible: false,
        }),
      ],
      artifacts: [artifact],
      testedAt: "2026-07-12T20:00:01.000Z",
    });

    expect(bundle.receipt.receiptId).toBe("receipt_1");
    expect(bundle.evidenceManifest.artifacts).toEqual([artifact]);
    expect(bundle.receipt.evidenceManifestHash).toBe(
      bundle.evidenceManifest.evidenceManifestHash,
    );
  });
});
