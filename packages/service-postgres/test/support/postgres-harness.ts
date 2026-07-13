import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach } from "vitest";

import { applyMigrations } from "../../src/migrate.js";
import { createPostgresPool } from "../../src/pool.js";

const databaseUrl = process.env["DATABASE_URL"];

export const postgresEnabled = databaseUrl !== undefined && databaseUrl.length > 0;

export function createPostgresTestPool(): Pool {
  if (!postgresEnabled || databaseUrl === undefined) {
    throw new TypeError("DATABASE_URL is required for Postgres integration tests");
  }
  return createPostgresPool({ connectionString: databaseUrl });
}

export function usePostgresTestHarness(getPool: () => Pool): void {
  beforeAll(async () => {
    await applyMigrations(getPool());
  });

  beforeEach(async () => {
    await getPool().query(`
      TRUNCATE TABLE
        report_bundles,
        receipts,
        verification_requests,
        idempotency_entries
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await getPool().end();
  });
}
