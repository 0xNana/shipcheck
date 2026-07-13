import type { AcceptanceReceipt } from "@shipcheck/domain";
import type {
  ReportBundle,
  VerificationRequestUpdate,
} from "@shipcheck/service-core";
import type { Pool } from "pg";

import { withTransaction } from "./client.js";
import { PostgresReceiptStore } from "./receipt-store.js";
import { PostgresReportStore } from "./report-store.js";
import { PostgresRequestStore } from "./request-store.js";

export interface VerificationSettlementInput<TResponse = unknown> {
  readonly receipt: AcceptanceReceipt;
  readonly reportBundle: ReportBundle;
  readonly requestId: string;
  readonly requestUpdate: VerificationRequestUpdate<TResponse>;
}

export async function commitVerificationSettlement<TResponse = unknown>(
  pool: Pool,
  input: VerificationSettlementInput<TResponse>,
): Promise<void> {
  await withTransaction(pool, async (client) => {
    const receiptStore = new PostgresReceiptStore(client);
    const reportStore = new PostgresReportStore(client);
    const requestStore = new PostgresRequestStore<TResponse>(client);

    await receiptStore.put(input.receipt);
    await reportStore.put(input.reportBundle);
    await requestStore.update(input.requestId, input.requestUpdate);
  });
}
