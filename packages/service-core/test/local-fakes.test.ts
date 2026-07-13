import type { AcceptanceReceipt, VerifyRequest } from "@shipcheck/domain";
import { describe, expect, it } from "vitest";

import {
  LocalIdempotencyStore,
  LocalReceiptStore,
  LocalRequestStore,
  LocalVerificationQueue,
  type StoredVerificationRequest,
} from "../src/index.js";

const input: VerifyRequest = {
  brief: "Build a launch page with pricing.",
  deliveryUrl: "https://example.com/",
  mode: "quick",
  maxRequirements: 12,
};

function requestRecord(
  status: StoredVerificationRequest["status"] = "QUEUED",
): StoredVerificationRequest {
  return {
    requestId: "sc_req_1",
    input,
    requestHash: "a".repeat(64),
    status,
    createdAt: "2026-07-12T20:00:00.000Z",
    updatedAt: "2026-07-12T20:00:00.000Z",
  };
}

describe("local service fakes", () => {
  it("stores request records without exposing mutable internal state", async () => {
    const store = new LocalRequestStore();
    const record = requestRecord();

    await store.put(record);
    const loaded = await store.get(record.requestId);

    expect(loaded).toEqual(record);
    expect(loaded).not.toBe(record);
  });

  it("updates existing request records and rejects unknown IDs", async () => {
    const store = new LocalRequestStore();
    await store.put(requestRecord());

    const updated = await store.update("sc_req_1", {
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

  it("stores and retrieves receipts by receipt ID", async () => {
    const store = new LocalReceiptStore();
    const receipt = {
      receiptId: "sc_receipt_1",
      verdict: "ACCEPTED",
    } as unknown as AcceptanceReceipt;

    await store.put(receipt);

    expect(await store.get("sc_receipt_1")).toEqual(receipt);
    expect(await store.get("missing")).toBeUndefined();
    await store.delete("sc_receipt_1");
    expect(await store.get("sc_receipt_1")).toBeUndefined();
  });

  it("dequeues verification jobs in FIFO order", async () => {
    const queue = new LocalVerificationQueue();

    await queue.enqueue({ requestId: "sc_req_1" });
    await queue.enqueue({ requestId: "sc_req_2" });

    await expect(queue.dequeue()).resolves.toEqual({ requestId: "sc_req_1" });
    await expect(queue.dequeue()).resolves.toEqual({ requestId: "sc_req_2" });
    await expect(queue.dequeue()).resolves.toBeUndefined();
  });
});

describe("LocalIdempotencyStore", () => {
  it("claims a new key and replays its completed value", async () => {
    const store = new LocalIdempotencyStore<{ requestId: string }>();

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
    const store = new LocalIdempotencyStore<{ requestId: string }>();
    await store.claim("verify", "key-12345", "hash-a");

    await expect(store.claim("verify", "key-12345", "hash-a")).resolves.toEqual({
      outcome: "IN_PROGRESS",
    });
    await expect(store.claim("verify", "key-12345", "hash-b")).resolves.toEqual({
      outcome: "CONFLICT",
    });
  });

  it("allows only one concurrent claim for a key", async () => {
    const store = new LocalIdempotencyStore<{ requestId: string }>();

    const claims = await Promise.all([
      store.claim("verify", "key-12345", "hash-a"),
      store.claim("verify", "key-12345", "hash-a"),
    ]);

    expect(claims).toEqual([
      { outcome: "CLAIMED" },
      { outcome: "IN_PROGRESS" },
    ]);
  });

  it("releases failed claims so the same request can retry", async () => {
    const store = new LocalIdempotencyStore<{ requestId: string }>();
    await store.claim("verify", "key-12345", "hash-a");

    await store.release("verify", "key-12345", "hash-a");

    await expect(store.claim("verify", "key-12345", "hash-a")).resolves.toEqual({
      outcome: "CLAIMED",
    });
  });

  it("removes a completed value when persistence compensation is required", async () => {
    const store = new LocalIdempotencyStore<{ requestId: string }>();
    await store.claim("verify", "key-12345", "hash-a");
    await store.complete("verify", "key-12345", "hash-a", {
      requestId: "sc_req_1",
    });

    await store.release("verify", "key-12345", "hash-a");

    await expect(store.inspect("verify", "key-12345", "hash-a")).resolves.toEqual({
      outcome: "MISS",
    });
  });
});
