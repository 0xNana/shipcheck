import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { FixedClock } from "../src/clock.js";
import {
  PostgresAdvisoryLock,
  PostgresAdvisoryLockFactory,
  withAdvisoryLock,
} from "../src/advisory-lock.js";
import { DEFAULT_RETENTION_WINDOWS } from "../src/config.js";
import { createRetentionDryRunCommand } from "../src/dry-run-command.js";
import { RetentionService } from "../src/retention-service.js";

function createMockPool(queryImpl?: (sql: string) => unknown): {
  pool: Pool;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn((sql: string) => {
    if (queryImpl !== undefined) {
      return Promise.resolve(queryImpl(sql));
    }
    if (sql.includes("jsonb_array_elements")) {
      return Promise.resolve({
        rows: [{ evidence_id: "ev_0123456789abcdef01234567" }],
      });
    }
    if (sql.includes("FROM report_bundles")) {
      return Promise.resolve({ rows: [{ receipt_id: "sc_receipt_old" }] });
    }
    if (sql.includes("FROM receipts")) {
      return Promise.resolve({ rows: [{ receipt_id: "sc_receipt_old" }] });
    }
    if (sql.includes("FROM verification_requests")) {
      return Promise.resolve({ rows: [{ request_id: "sc_req_old" }] });
    }
    if (sql.includes("DELETE FROM report_bundles")) {
      return Promise.resolve({ rowCount: 1 });
    }
    if (sql.includes("DELETE FROM receipts")) {
      return Promise.resolve({ rowCount: 1 });
    }
    if (sql.includes("DELETE FROM verification_requests")) {
      return Promise.resolve({ rowCount: 1 });
    }
    return Promise.resolve({ rows: [] });
  });
  const client = {
    query,
    release: vi.fn(),
  };
  return {
    pool: {
      query,
      connect: () => Promise.resolve(client),
    } as unknown as Pool,
    query,
  };
}

function createLockFactory(acquired: boolean) {
  return {
    create: () => ({
      tryAcquire: () => Promise.resolve(acquired),
      release: () => Promise.resolve(),
    }),
  };
}

describe("RetentionService", () => {
  it("collects expired evidence and metadata candidates using injected clock", async () => {
    const { pool } = createMockPool();
    const service = new RetentionService({
      pool,
      blobStore: { delete: vi.fn() } as never,
      clock: new FixedClock(new Date("2026-08-15T00:00:00.000Z")),
      windows: DEFAULT_RETENTION_WINDOWS,
      lockFactory: new PostgresAdvisoryLockFactory(1n),
    });

    const candidates = await service.collectCandidates();

    expect(candidates.evidenceIds).toEqual(["ev_0123456789abcdef01234567"]);
    expect(candidates.reportReceiptIds).toEqual(["sc_receipt_old"]);
    expect(candidates.receiptIds).toEqual(["sc_receipt_old"]);
    expect(candidates.requestIds).toEqual(["sc_req_old"]);
  });

  it("deletes evidence blobs before metadata in live runs", async () => {
    const { pool, query } = createMockPool();
    const deleteBlob = vi.fn(() => Promise.resolve());
    const service = new RetentionService({
      pool,
      blobStore: { delete: deleteBlob } as never,
      clock: new FixedClock(new Date("2026-08-15T00:00:00.000Z")),
      windows: DEFAULT_RETENTION_WINDOWS,
      lockFactory: createLockFactory(true),
    });

    const result = await service.run({ dryRun: false });

    expect(result.skippedBecauseLocked).toBe(false);
    expect(deleteBlob).toHaveBeenCalledWith("ev_0123456789abcdef01234567");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM report_bundles"),
      expect.anything(),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM receipts"),
      expect.anything(),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM verification_requests"),
      expect.anything(),
    );
  });

  it("does not delete anything during dry runs", async () => {
    const { pool, query } = createMockPool();
    const deleteBlob = vi.fn();
    const service = new RetentionService({
      pool,
      blobStore: { delete: deleteBlob } as never,
      lockFactory: createLockFactory(true),
    });

    const result = await service.run({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(deleteBlob).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) => String(sql).startsWith("DELETE")),
    ).toBe(false);
  });

  it("skips work when the advisory lock is already held", async () => {
    const { pool, query } = createMockPool();
    const service = new RetentionService({
      pool,
      blobStore: { delete: vi.fn() } as never,
      lockFactory: createLockFactory(false),
    });

    const result = await service.run({ dryRun: false });

    expect(result.skippedBecauseLocked).toBe(true);
    expect(
      query.mock.calls.some(([sql]) => String(sql).startsWith("DELETE")),
    ).toBe(false);
  });
});

describe("createRetentionDryRunCommand", () => {
  it("exports a JSON dry-run report", async () => {
    const { pool } = createMockPool();
    const service = new RetentionService({
      pool,
      blobStore: { delete: vi.fn() } as never,
      lockFactory: createLockFactory(true),
    });
    const command = createRetentionDryRunCommand(service);

    const output = await command.run();
    const parsed = JSON.parse(output) as {
      command: string;
      candidates: { evidenceIds: string[] };
    };

    expect(command.name).toBe("retention:dry-run");
    expect(parsed.command).toBe("retention:dry-run");
    expect(parsed.candidates.evidenceIds).toContain(
      "ev_0123456789abcdef01234567",
    );
  });
});

describe("PostgresAdvisoryLock", () => {
  it("acquires and releases a postgres advisory lock", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ pg_try_advisory_lock: true }] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query, release: vi.fn() };
    const pool = {
      connect: () => Promise.resolve(client),
    } as unknown as Pool;

    const result = await withAdvisoryLock(
      pool,
      new PostgresAdvisoryLockFactory(99n),
      () => Promise.resolve("done"),
    );

    expect(result).toBe("done");
    expect(query).toHaveBeenCalledWith(
      "SELECT pg_try_advisory_lock($1::bigint) AS pg_try_advisory_lock",
      ["99"],
    );
    expect(query).toHaveBeenCalledWith(
      "SELECT pg_advisory_unlock($1::bigint)",
      ["99"],
    );
    expect(client.release).toHaveBeenCalled();
  });

  it("returns undefined when the lock cannot be acquired", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ pg_try_advisory_lock: false }],
    });
    const client = { query, release: vi.fn() };

    const lock = new PostgresAdvisoryLock(client as never, 99n);
    await expect(lock.tryAcquire()).resolves.toBe(false);
  });
});
