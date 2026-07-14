import type {
  AcceptanceContract,
  AcceptanceReceipt,
  EvidenceManifest,
  RequirementResult,
} from "@shipcheck/domain";
import type { ReportBundle, ReportStore } from "@shipcheck/service-core";

import { queryRows, toJsonb, type Queryable } from "./client.js";

interface ReportBundleRow {
  readonly receipt_id: string;
  readonly contract: AcceptanceContract;
  readonly results: readonly RequirementResult[];
  readonly receipt: AcceptanceReceipt;
  readonly evidence_manifest: EvidenceManifest;
  readonly created_at: Date;
}

function mapRow(row: ReportBundleRow): ReportBundle {
  return {
    receiptId: row.receipt_id,
    contract: row.contract,
    results: row.results,
    receipt: row.receipt,
    evidenceManifest: row.evidence_manifest,
    createdAt: row.created_at.toISOString(),
  };
}

export class PostgresReportStore implements ReportStore {
  constructor(private readonly db: Queryable) {}

  async put(bundle: ReportBundle): Promise<void> {
    await this.db.query(
      `
        INSERT INTO report_bundles (
          receipt_id,
          contract,
          results,
          receipt,
          evidence_manifest,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (receipt_id) DO UPDATE SET
          contract = EXCLUDED.contract,
          results = EXCLUDED.results,
          receipt = EXCLUDED.receipt,
          evidence_manifest = EXCLUDED.evidence_manifest,
          created_at = EXCLUDED.created_at
      `,
      [
        bundle.receiptId,
        toJsonb(bundle.contract),
        toJsonb(bundle.results),
        toJsonb(bundle.receipt),
        toJsonb(bundle.evidenceManifest),
        bundle.createdAt,
      ],
    );
  }

  async get(receiptId: string): Promise<ReportBundle | undefined> {
    const rows = await queryRows<ReportBundleRow>(
      this.db,
      `
        SELECT
          receipt_id,
          contract,
          results,
          receipt,
          evidence_manifest,
          created_at
        FROM report_bundles
        WHERE receipt_id = $1
      `,
      [receiptId],
    );
    const row = rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  async delete(receiptId: string): Promise<void> {
    await this.db.query(`DELETE FROM report_bundles WHERE receipt_id = $1`, [
      receiptId,
    ]);
  }
}
