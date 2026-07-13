import type { Pool } from "pg";

import type { TigrisEvidenceBlobStore } from "@shipcheck/evidence-tigris";

import type { AdvisoryLockFactory } from "./advisory-lock.js";
import { withAdvisoryLock } from "./advisory-lock.js";
import type { Clock } from "./clock.js";
import { SystemClock } from "./clock.js";
import {
  DEFAULT_RETENTION_WINDOWS,
  subtractDays,
  type RetentionWindows,
} from "./config.js";

export interface RetentionCandidateSets {
  readonly evidenceIds: readonly string[];
  readonly reportReceiptIds: readonly string[];
  readonly receiptIds: readonly string[];
  readonly requestIds: readonly string[];
}

export interface RetentionRunResult extends RetentionCandidateSets {
  readonly dryRun: boolean;
  readonly skippedBecauseLocked: boolean;
}

export interface RetentionServiceOptions {
  readonly pool: Pool;
  readonly blobStore: TigrisEvidenceBlobStore;
  readonly clock?: Clock;
  readonly windows?: RetentionWindows;
  readonly lockFactory: AdvisoryLockFactory;
}

interface EvidenceCandidateRow {
  readonly evidence_id: string;
}

interface ReceiptCandidateRow {
  readonly receipt_id: string;
}

interface RequestCandidateRow {
  readonly request_id: string;
}

export class RetentionService {
  private readonly clock: Clock;
  private readonly windows: RetentionWindows;

  constructor(private readonly options: RetentionServiceOptions) {
    this.clock = options.clock ?? new SystemClock();
    this.windows = options.windows ?? DEFAULT_RETENTION_WINDOWS;
  }

  async collectCandidates(reference = this.clock.now()): Promise<RetentionCandidateSets> {
    const evidenceCutoff = subtractDays(
      reference,
      this.windows.evidenceRetentionDays,
    ).toISOString();
    const metadataCutoff = subtractDays(
      reference,
      this.windows.receiptRetentionDays,
    );
    const requestCutoff = subtractDays(
      reference,
      this.windows.requestRetentionDays,
    );

    const evidenceRows = await this.options.pool.query<EvidenceCandidateRow>(
      `
        SELECT DISTINCT artifact->>'id' AS evidence_id
        FROM report_bundles bundle,
        LATERAL jsonb_array_elements(bundle.evidence_manifest->'artifacts') AS artifact
        WHERE (artifact->>'createdAt')::timestamptz < $1::timestamptz
      `,
      [evidenceCutoff],
    );

    const reportRows = await this.options.pool.query<ReceiptCandidateRow>(
      `
        SELECT receipt_id
        FROM report_bundles
        WHERE created_at < $1::timestamptz
      `,
      [metadataCutoff.toISOString()],
    );

    const receiptRows = await this.options.pool.query<ReceiptCandidateRow>(
      `
        SELECT receipt_id
        FROM receipts
        WHERE tested_at < $1::timestamptz
      `,
      [metadataCutoff.toISOString()],
    );

    const requestRows = await this.options.pool.query<RequestCandidateRow>(
      `
        SELECT request_id
        FROM verification_requests
        WHERE created_at < $1::timestamptz
      `,
      [requestCutoff.toISOString()],
    );

    return {
      evidenceIds: evidenceRows.rows.map(
        (row: EvidenceCandidateRow) => row.evidence_id,
      ),
      reportReceiptIds: reportRows.rows.map(
        (row: ReceiptCandidateRow) => row.receipt_id,
      ),
      receiptIds: receiptRows.rows.map(
        (row: ReceiptCandidateRow) => row.receipt_id,
      ),
      requestIds: requestRows.rows.map(
        (row: RequestCandidateRow) => row.request_id,
      ),
    };
  }

  async run(input: { readonly dryRun?: boolean } = {}): Promise<RetentionRunResult> {
    const dryRun = input.dryRun ?? false;
    const candidates = await this.collectCandidates();
    const lockedResult = await withAdvisoryLock(
      this.options.pool,
      this.options.lockFactory,
      async () => {
        if (dryRun) {
          return candidates;
        }
        await this.deleteInOrder(candidates);
        return candidates;
      },
    );

    if (lockedResult === undefined) {
      return {
        ...candidates,
        dryRun,
        skippedBecauseLocked: true,
      };
    }

    return {
      ...lockedResult,
      dryRun,
      skippedBecauseLocked: false,
    };
  }

  private async deleteInOrder(
    candidates: RetentionCandidateSets,
  ): Promise<void> {
    for (const evidenceId of candidates.evidenceIds) {
      await this.options.blobStore.delete(evidenceId).catch(() => undefined);
    }

    if (candidates.reportReceiptIds.length > 0) {
      await this.options.pool.query(
        `DELETE FROM report_bundles WHERE receipt_id = ANY($1::text[])`,
        [candidates.reportReceiptIds],
      );
    }

    if (candidates.receiptIds.length > 0) {
      await this.options.pool.query(
        `DELETE FROM receipts WHERE receipt_id = ANY($1::text[])`,
        [candidates.receiptIds],
      );
    }

    if (candidates.requestIds.length > 0) {
      await this.options.pool.query(
        `DELETE FROM verification_requests WHERE request_id = ANY($1::text[])`,
        [candidates.requestIds],
      );
    }
  }
}
