import { beforeAll, describe, expect, it } from "vitest";

import { commitVerificationSettlement } from "../src/settlement.js";
import {
  sampleReceipt,
  sampleReportBundle,
  sampleRequestRecord,
} from "./support/contract-tests.js";
import {
  createPostgresTestPool,
  postgresEnabled,
  usePostgresTestHarness,
} from "./support/postgres-harness.js";
import { PostgresReceiptStore } from "../src/receipt-store.js";
import { PostgresReportStore } from "../src/report-store.js";
import { PostgresRequestStore } from "../src/request-store.js";

describe.skipIf(!postgresEnabled)("commitVerificationSettlement", () => {
  let pool!: ReturnType<typeof createPostgresTestPool>;

  beforeAll(() => {
    pool = createPostgresTestPool();
  });

  usePostgresTestHarness(() => pool);

  it("atomically persists receipt, report bundle, and request update", async () => {
    const requestStore = new PostgresRequestStore(pool);
    const receiptStore = new PostgresReceiptStore(pool);
    const reportStore = new PostgresReportStore(pool);
    const record = sampleRequestRecord("RUNNING");
    const receipt = sampleReceipt();
    const bundle = sampleReportBundle(receipt.receiptId);

    await requestStore.put(record);

    await commitVerificationSettlement(pool, {
      receipt,
      reportBundle: bundle,
      requestId: record.requestId,
      requestUpdate: {
        status: "COMPLETED",
        response: { requestId: record.requestId, receipt },
        updatedAt: "2026-07-12T20:06:00.000Z",
      },
    });

    expect(await receiptStore.get(receipt.receiptId)).toEqual(receipt);
    expect(await reportStore.get(bundle.receiptId)).toEqual(bundle);
    await expect(requestStore.get(record.requestId)).resolves.toMatchObject({
      status: "COMPLETED",
    });
  });

  it("rolls back all writes when request update fails", async () => {
    const receiptStore = new PostgresReceiptStore(pool);
    const reportStore = new PostgresReportStore(pool);
    const receipt = sampleReceipt("sc_receipt_rollback");
    const bundle = sampleReportBundle(receipt.receiptId);

    await expect(
      commitVerificationSettlement(pool, {
        receipt,
        reportBundle: bundle,
        requestId: "missing-request",
        requestUpdate: {
          status: "COMPLETED",
          updatedAt: "2026-07-12T20:06:00.000Z",
        },
      }),
    ).rejects.toThrow("Unknown verification request");

    expect(await receiptStore.get(receipt.receiptId)).toBeUndefined();
    expect(await reportStore.get(bundle.receiptId)).toBeUndefined();
  });
});
