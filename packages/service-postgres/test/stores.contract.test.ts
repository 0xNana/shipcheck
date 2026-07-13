import {
  LocalIdempotencyStore,
  LocalReceiptStore,
  LocalReportStore,
  LocalRequestStore,
} from "@shipcheck/service-core";
import { beforeAll, describe, expect, it } from "vitest";

import {
  PostgresIdempotencyStore,
  PostgresReceiptStore,
  PostgresReportStore,
  PostgresRequestStore,
} from "../src/index.js";
import {
  describeIdempotencyStoreContract,
  describeReceiptStoreContract,
  describeReportStoreContract,
  describeRequestStoreContract,
} from "./support/contract-tests.js";
import {
  createPostgresTestPool,
  postgresEnabled,
  usePostgresTestHarness,
} from "./support/postgres-harness.js";

describeRequestStoreContract("Local", () => new LocalRequestStore());
describeReceiptStoreContract("Local", () => new LocalReceiptStore());
describeReportStoreContract("Local", () => new LocalReportStore());
describeIdempotencyStoreContract(
  "Local",
  () => new LocalIdempotencyStore<{ requestId: string }>(),
);

describe.skipIf(!postgresEnabled)("Postgres store contracts", () => {
  let pool!: ReturnType<typeof createPostgresTestPool>;

  beforeAll(() => {
    pool = createPostgresTestPool();
  });

  usePostgresTestHarness(() => pool);

  describeRequestStoreContract("Postgres", () => new PostgresRequestStore(pool));
  describeReceiptStoreContract("Postgres", () => new PostgresReceiptStore(pool));
  describeReportStoreContract("Postgres", () => new PostgresReportStore(pool));
  describeIdempotencyStoreContract(
    "Postgres",
    () => new PostgresIdempotencyStore<{ requestId: string }>(pool),
  );
});

describe.skipIf(!postgresEnabled)("Postgres vs Local parity", () => {
  let pool!: ReturnType<typeof createPostgresTestPool>;

  beforeAll(() => {
    pool = createPostgresTestPool();
  });

  usePostgresTestHarness(() => pool);

  it("matches LocalRequestStore behavior for a completed request lifecycle", async () => {
    const local = new LocalRequestStore();
    const postgres = new PostgresRequestStore(pool);
    const record = {
      requestId: "sc_req_parity_1",
      input: {
        brief: "Build a launch page with pricing.",
        deliveryUrl: "https://example.com/",
        mode: "quick" as const,
        maxRequirements: 12,
      },
      requestHash: "a".repeat(64),
      status: "QUEUED" as const,
      createdAt: "2026-07-12T20:00:00.000Z",
      updatedAt: "2026-07-12T20:00:00.000Z",
    };

    await local.put(record);
    await postgres.put(record);

    const localUpdated = await local.update(record.requestId, {
      status: "COMPLETED",
      response: { requestId: record.requestId },
      updatedAt: "2026-07-12T20:00:05.000Z",
    });
    const postgresUpdated = await postgres.update(record.requestId, {
      status: "COMPLETED",
      response: { requestId: record.requestId },
      updatedAt: "2026-07-12T20:00:05.000Z",
    });

    expect(postgresUpdated).toEqual(localUpdated);
  });
});
