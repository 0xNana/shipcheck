import {
  AcceptanceContractSchema,
  AcceptanceReceiptSchema,
  EvidenceManifestSchema,
} from "@shipcheck/domain";
import { describe, expect, it } from "vitest";

import {
  LocalEvidenceLinkProvider,
  LocalReportStore,
} from "../src/local-fakes.js";
import type { ReportBundle } from "../src/contracts.js";

function sampleBundle(): ReportBundle {
  const contract = AcceptanceContractSchema.parse({
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
    contractHash: "a".repeat(64),
  });
  const receipt = AcceptanceReceiptSchema.parse({
    receiptSchemaVersion: "shipcheck-acceptance-receipt-v1.0.0",
    receiptId: "receipt_1",
    contractHash: contract.contractHash,
    contractSchemaVersion: contract.schemaVersion,
    target: contract.target,
    targetFingerprint: {
      finalUrl: contract.target,
      sha256: "b".repeat(64),
    },
    compilerVersion: contract.compilerVersion,
    executionPolicyVersion: contract.executionPolicyVersion,
    adapterVersion: "adapter-v1",
    evidenceManifestVersion: "shipcheck-evidence-manifest-v1.0.0",
    verdict: "ACCEPTED",
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      unverified: 0,
      notObjectivelyTestable: 0,
      unsupported: 0,
    },
    results: [],
    evidenceManifestHash: "c".repeat(64),
    policyVersion: contract.policyVersion,
    testedAt: "2026-07-12T20:00:01.000Z",
    receiptHash: "d".repeat(64),
  });
  const evidenceManifest = EvidenceManifestSchema.parse({
    schemaVersion: "shipcheck-evidence-manifest-v1.0.0",
    artifacts: [
      {
        id: "ev_1",
        type: "SCREENSHOT",
        sha256: "e".repeat(64),
        contentType: "image/png",
        sizeBytes: 10,
        storageUrl: "https://objects.example/ev_1",
        createdAt: "2026-07-12T20:00:01.000Z",
        redaction: { applied: false },
      },
    ],
    evidenceManifestHash: "c".repeat(64),
  });
  return {
    receiptId: receipt.receiptId,
    contract,
    results: [],
    receipt,
    evidenceManifest,
    createdAt: "2026-07-12T20:00:01.000Z",
  };
}

describe("LocalReportStore", () => {
  it("stores and retrieves report bundles independently from receipts", async () => {
    const store = new LocalReportStore();
    const bundle = sampleBundle();

    await store.put(bundle);
    await expect(store.get("receipt_1")).resolves.toEqual(bundle);
    await store.delete("receipt_1");
    await expect(store.get("receipt_1")).resolves.toBeUndefined();
  });
});

describe("LocalEvidenceLinkProvider", () => {
  it("returns a read link only for evidence that belongs to the report", async () => {
    const reportStore = new LocalReportStore();
    const provider = new LocalEvidenceLinkProvider(reportStore);
    await reportStore.put(sampleBundle());

    await expect(
      provider.createReadLink(
        "receipt_1",
        "ev_1",
        "2026-07-12T21:00:00.000Z",
      ),
    ).resolves.toEqual({
      url: "https://objects.example/ev_1",
      expiresAt: "2026-07-12T21:00:00.000Z",
    });
    await expect(
      provider.createReadLink(
        "receipt_1",
        "ev_missing",
        "2026-07-12T21:00:00.000Z",
      ),
    ).resolves.toBeUndefined();
  });
});
