import type { AcceptanceReceipt } from "@shipcheck/domain";
import type { ReceiptStore } from "@shipcheck/service-core";

import { queryRows, type Queryable } from "./client.js";

interface ReceiptRow {
  readonly receipt_id: string;
  readonly receipt: AcceptanceReceipt;
}

export class PostgresReceiptStore implements ReceiptStore {
  constructor(private readonly db: Queryable) {}

  async put(receipt: AcceptanceReceipt): Promise<void> {
    await this.db.query(
      `
        INSERT INTO receipts (receipt_id, receipt, tested_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (receipt_id) DO UPDATE SET
          receipt = EXCLUDED.receipt,
          tested_at = EXCLUDED.tested_at
      `,
      [receipt.receiptId, receipt, receipt.testedAt],
    );
  }

  async get(receiptId: string): Promise<AcceptanceReceipt | undefined> {
    const rows = await queryRows<ReceiptRow>(
      this.db,
      `SELECT receipt_id, receipt FROM receipts WHERE receipt_id = $1`,
      [receiptId],
    );
    return rows[0]?.receipt;
  }

  async delete(receiptId: string): Promise<void> {
    await this.db.query(`DELETE FROM receipts WHERE receipt_id = $1`, [
      receiptId,
    ]);
  }
}
