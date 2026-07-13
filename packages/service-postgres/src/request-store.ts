import type { VerifyRequest } from "@shipcheck/domain";

import type {
  RequestStore,
  StoredServiceError,
  StoredVerificationRequest,
  VerificationRequestStatus,
  VerificationRequestUpdate,
} from "@shipcheck/service-core";

import { queryRows, type Queryable } from "./client.js";

interface VerificationRequestRow<TResponse = unknown> {
  readonly request_id: string;
  readonly input: VerifyRequest;
  readonly request_hash: string;
  readonly status: VerificationRequestStatus;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly response: TResponse | null;
  readonly error: StoredServiceError | null;
}

function toIsoString(value: Date): string {
  return value.toISOString();
}

function mapRow<TResponse>(
  row: VerificationRequestRow<TResponse>,
): StoredVerificationRequest<TResponse> {
  return {
    requestId: row.request_id,
    input: row.input,
    requestHash: row.request_hash,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    ...(row.response === null
      ? {}
      : { response: row.response }),
    ...(row.error === null ? {} : { error: row.error }),
  };
}

export class PostgresRequestStore<TResponse = unknown>
  implements RequestStore<TResponse>
{
  constructor(private readonly db: Queryable) {}

  async put(record: StoredVerificationRequest<TResponse>): Promise<void> {
    await this.db.query(
      `
        INSERT INTO verification_requests (
          request_id,
          input,
          request_hash,
          status,
          created_at,
          updated_at,
          response,
          error
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (request_id) DO UPDATE SET
          input = EXCLUDED.input,
          request_hash = EXCLUDED.request_hash,
          status = EXCLUDED.status,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          response = EXCLUDED.response,
          error = EXCLUDED.error
      `,
      [
        record.requestId,
        record.input,
        record.requestHash,
        record.status,
        record.createdAt,
        record.updatedAt,
        record.response ?? null,
        record.error ?? null,
      ],
    );
  }

  async get(
    requestId: string,
  ): Promise<StoredVerificationRequest<TResponse> | undefined> {
    const rows = await queryRows<VerificationRequestRow<TResponse>>(
      this.db,
      `
        SELECT
          request_id,
          input,
          request_hash,
          status,
          created_at,
          updated_at,
          response,
          error
        FROM verification_requests
        WHERE request_id = $1
      `,
      [requestId],
    );
    const row = rows[0];
    return row === undefined ? undefined : mapRow<TResponse>(row);
  }

  async update(
    requestId: string,
    update: VerificationRequestUpdate<TResponse>,
  ): Promise<StoredVerificationRequest<TResponse>> {
    const rows = await queryRows<VerificationRequestRow<TResponse>>(
      this.db,
      `
        UPDATE verification_requests
        SET
          status = $2,
          updated_at = $3,
          response = COALESCE($4, response),
          error = COALESCE($5, error)
        WHERE request_id = $1
        RETURNING
          request_id,
          input,
          request_hash,
          status,
          created_at,
          updated_at,
          response,
          error
      `,
      [
        requestId,
        update.status,
        update.updatedAt,
        update.response ?? null,
        update.error ?? null,
      ],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new TypeError(`Unknown verification request: ${requestId}`);
    }
    return mapRow<TResponse>(row);
  }

  async delete(requestId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM verification_requests WHERE request_id = $1`,
      [requestId],
    );
  }
}
