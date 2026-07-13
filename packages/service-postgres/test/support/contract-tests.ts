import { describe, expect, it } from "vitest";

import {
  AcceptanceContractSchema,
  AcceptanceReceiptSchema,
  type AcceptanceContract,
  type AcceptanceReceipt,
  type EvidenceManifest,
  type VerifyRequest,
} from "@shipcheck/domain";
import type {
  IdempotencyStore,
  ReceiptStore,
  ReportBundle,
  ReportStore,
  RequestStore,
  StoredVerificationRequest,
} from "@shipcheck/service-core";

export const sampleVerifyRequest: VerifyRequest = {
  brief: "Build a launch page with pricing.",
  deliveryUrl: "https://example.com/",
  mode: "quick",
  maxRequirements: 12,
};

export function sampleRequestRecord(
  status: StoredVerificationRequest["status"] = "QUEUED",
): StoredVerificationRequest {
  return {
    requestId: "sc_req_contract_1",
    input: sampleVerifyRequest,
    requestHash: "a".repeat(64),
    status,
    createdAt: "2026-07-12T20:00:00.000Z",
    updatedAt: "2026-07-12T20:00:00.000Z",
  };
}

export function sampleReceipt(
  receiptId = "sc_receipt_contract_1",
): AcceptanceReceipt {
  return AcceptanceReceiptSchema.parse({
    receiptSchemaVersion: "shipcheck-acceptance-receipt-v1.0.0",
    receiptId,
    contractHash: "b".repeat(64),
    contractSchemaVersion: "shipcheck-acceptance-contract-v1.0.0",
    target: "https://example.com/",
    targetFingerprint: {
      finalUrl: "https://example.com/",
      sha256: "c".repeat(64),
    },
    compilerVersion: "shipcheck-compiler-v1",
    executionPolicyVersion: "shipcheck-public-web-v1.0.0",
    adapterVersion: "shipcheck-public-web-v1.0.0",
    evidenceManifestVersion: "shipcheck-evidence-manifest-v1.0.0",
    verdict: "ACCEPTED",
    summary: {
      total: 1,
      passed: 1,
      failed: 0,
      unverified: 0,
      notObjectivelyTestable: 0,
      unsupported: 0,
    },
    results: [],
    evidenceManifestHash: "d".repeat(64),
    policyVersion: "shipcheck-acceptance-v1.0.0",
    testedAt: "2026-07-12T20:05:00.000Z",
    receiptHash: "e".repeat(64),
  });
}

export function sampleContract(): AcceptanceContract {
  return AcceptanceContractSchema.parse({
    schemaVersion: "shipcheck-acceptance-contract-v1.0.0",
    contractId: "contract_contract_1",
    compilerVersion: "shipcheck-compiler-v1",
    policyVersion: "shipcheck-acceptance-v1.0.0",
    executionPolicyVersion: "shipcheck-public-web-v1.0.0",
    target: "https://example.com/",
    requirements: [
      {
        id: "req_pricing",
        statement: "A pricing section is present.",
        provenance: {
          kind: "BRIEF_SPAN",
          sourceText: "pricing",
          start: 24,
          end: 31,
        },
        class: "EXECUTABLE",
        adapter: "PUBLIC_WEB",
        priority: "REQUIRED",
        prioritySource: "DEFAULT",
        confidence: 0.95,
        intent: "SECTION_PRESENT",
      },
    ],
    createdAt: "2026-07-12T20:01:00.000Z",
    contractHash: "f".repeat(64),
  });
}

export function sampleEvidenceManifest(): EvidenceManifest {
  return {
    schemaVersion: "shipcheck-evidence-manifest-v1.0.0",
    artifacts: [
      {
        id: "ev_contract_artifact_1",
        type: "SCREENSHOT",
        sha256: "1".repeat(64),
        contentType: "image/png",
        sizeBytes: 128,
        createdAt: "2026-07-12T20:04:00.000Z",
        redaction: { applied: false },
      },
    ],
    evidenceManifestHash: "2".repeat(64),
  } as EvidenceManifest;
}

export function sampleReportBundle(
  receiptId = "sc_receipt_contract_1",
): ReportBundle {
  const receipt = sampleReceipt(receiptId);
  return {
    receiptId,
    contract: sampleContract(),
    results: receipt.results,
    receipt,
    evidenceManifest: sampleEvidenceManifest(),
    createdAt: "2026-07-12T20:05:00.000Z",
  };
}

export function describeRequestStoreContract(
  label: string,
  createStore: () => RequestStore,
): void {
  describe(`${label} RequestStore contract`, () => {
    it("stores request records without exposing mutable internal state", async () => {
      const store = createStore();
      const record = sampleRequestRecord();

      await store.put(record);
      const loaded = await store.get(record.requestId);

      expect(loaded).toEqual(record);
      expect(loaded).not.toBe(record);
    });

    it("updates existing request records and rejects unknown IDs", async () => {
      const store = createStore();
      await store.put(sampleRequestRecord());

      const updated = await store.update("sc_req_contract_1", {
        status: "RUNNING",
        updatedAt: "2026-07-12T20:00:01.000Z",
      });

      expect(updated.status).toBe("RUNNING");
      await expect(
        store.update("missing", {
          status: "FAILED",
          updatedAt: "2026-07-12T20:00:02.000Z",
        }),
      ).rejects.toThrow("Unknown verification request");
    });
  });
}

export function describeReceiptStoreContract(
  label: string,
  createStore: () => ReceiptStore,
): void {
  describe(`${label} ReceiptStore contract`, () => {
    it("stores and retrieves receipts by receipt ID", async () => {
      const store = createStore();
      const receipt = sampleReceipt();

      await store.put(receipt);

      expect(await store.get(receipt.receiptId)).toEqual(receipt);
      expect(await store.get("missing")).toBeUndefined();
      await store.delete(receipt.receiptId);
      expect(await store.get(receipt.receiptId)).toBeUndefined();
    });
  });
}

export function describeReportStoreContract(
  label: string,
  createStore: () => ReportStore,
): void {
  describe(`${label} ReportStore contract`, () => {
    it("stores and retrieves report bundles by receipt ID", async () => {
      const store = createStore();
      const bundle = sampleReportBundle();

      await store.put(bundle);

      expect(await store.get(bundle.receiptId)).toEqual(bundle);
      expect(await store.get("missing")).toBeUndefined();
      await store.delete(bundle.receiptId);
      expect(await store.get(bundle.receiptId)).toBeUndefined();
    });
  });
}

export function describeIdempotencyStoreContract(
  label: string,
  createStore: () => IdempotencyStore<{ requestId: string }>,
): void {
  describe(`${label} IdempotencyStore contract`, () => {
    it("claims a new key and replays its completed value", async () => {
      const store = createStore();

      await expect(store.claim("verify", "key-12345", "hash-a")).resolves.toEqual({
        outcome: "CLAIMED",
      });
      await store.complete("verify", "key-12345", "hash-a", {
        requestId: "sc_req_1",
      });

      await expect(store.claim("verify", "key-12345", "hash-a")).resolves.toEqual({
        outcome: "REPLAY",
        value: { requestId: "sc_req_1" },
      });
    });

    it("distinguishes in-progress and conflicting requests", async () => {
      const store = createStore();
      await store.claim("verify", "key-12345", "hash-a");

      await expect(store.claim("verify", "key-12345", "hash-a")).resolves.toEqual({
        outcome: "IN_PROGRESS",
      });
      await expect(store.claim("verify", "key-12345", "hash-b")).resolves.toEqual({
        outcome: "CONFLICT",
      });
    });

    it("releases failed claims so the same request can retry", async () => {
      const store = createStore();
      await store.claim("verify", "key-12345", "hash-a");

      await store.release("verify", "key-12345", "hash-a");

      await expect(store.claim("verify", "key-12345", "hash-a")).resolves.toEqual({
        outcome: "CLAIMED",
      });
    });
  });
}
