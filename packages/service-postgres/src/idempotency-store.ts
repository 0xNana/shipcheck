import type {
  IdempotencyClaim,
  IdempotencyLookup,
  IdempotencyStore,
} from "@shipcheck/service-core";

import { queryRows, type Queryable } from "./client.js";

type IdempotencyState = "PENDING" | "COMPLETED";

interface IdempotencyRow<T> {
  readonly namespace: string;
  readonly key: string;
  readonly fingerprint: string;
  readonly state: IdempotencyState;
  readonly value: T | null;
}

function toLookup<T>(row: IdempotencyRow<T>, fingerprint: string): IdempotencyLookup<T> {
  if (row.fingerprint !== fingerprint) {
    return { outcome: "CONFLICT" };
  }
  if (row.state === "PENDING") {
    return { outcome: "IN_PROGRESS" };
  }
  return { outcome: "REPLAY", value: row.value as T };
}

export class PostgresIdempotencyStore<T> implements IdempotencyStore<T> {
  constructor(private readonly db: Queryable) {}

  async inspect(
    namespace: string,
    key: string,
    fingerprint: string,
  ): Promise<IdempotencyLookup<T>> {
    const rows = await queryRows<IdempotencyRow<T>>(
      this.db,
      `
        SELECT namespace, key, fingerprint, state, value
        FROM idempotency_entries
        WHERE namespace = $1 AND key = $2
      `,
      [namespace, key],
    );
    const row = rows[0];
    return row === undefined ? { outcome: "MISS" } : toLookup<T>(row, fingerprint);
  }

  async claim(
    namespace: string,
    key: string,
    fingerprint: string,
  ): Promise<IdempotencyClaim<T>> {
    const inserted = await queryRows<IdempotencyRow<T>>(
      this.db,
      `
        INSERT INTO idempotency_entries (
          namespace,
          key,
          fingerprint,
          state,
          value,
          updated_at
        )
        VALUES ($1, $2, $3, 'PENDING', NULL, NOW())
        ON CONFLICT (namespace, key) DO NOTHING
        RETURNING namespace, key, fingerprint, state, value
      `,
      [namespace, key, fingerprint],
    );
    if (inserted[0] !== undefined) {
      return { outcome: "CLAIMED" };
    }
    const existing = await this.inspect(namespace, key, fingerprint);
    if (existing.outcome === "MISS") {
      return { outcome: "CLAIMED" };
    }
    return existing;
  }

  async complete(
    namespace: string,
    key: string,
    fingerprint: string,
    value: T,
  ): Promise<void> {
    const rows = await queryRows<IdempotencyRow<T>>(
      this.db,
      `
        UPDATE idempotency_entries
        SET
          state = 'COMPLETED',
          value = $4,
          updated_at = NOW()
        WHERE namespace = $1
          AND key = $2
          AND fingerprint = $3
          AND state = 'PENDING'
        RETURNING namespace, key, fingerprint, state, value
      `,
      [namespace, key, fingerprint, value],
    );
    if (rows[0] === undefined) {
      throw new TypeError("Idempotency claim is not active");
    }
  }

  async release(
    namespace: string,
    key: string,
    fingerprint: string,
  ): Promise<void> {
    await this.db.query(
      `
        DELETE FROM idempotency_entries
        WHERE namespace = $1
          AND key = $2
          AND fingerprint = $3
      `,
      [namespace, key, fingerprint],
    );
  }
}
