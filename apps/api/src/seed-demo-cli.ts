import { setDefaultResultOrder } from "node:dns";

import {
  createPostgresPool,
  PostgresReceiptStore,
  PostgresReportStore,
} from "@shipcheck/service-postgres";

import { buildDemoReportBundle, DEMO_RECEIPT_ID } from "./demo-bundle.js";

setDefaultResultOrder("ipv4first");

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new TypeError("DATABASE_URL is required to seed the demo report");
  }

  const bundle = buildDemoReportBundle();
  const pool = createPostgresPool({ connectionString: databaseUrl });
  try {
    const receiptStore = new PostgresReceiptStore(pool);
    const reportStore = new PostgresReportStore(pool);
    await receiptStore.put(bundle.receipt);
    await reportStore.put(bundle);
    console.log(
      JSON.stringify({
        event: "demo_report.seeded",
        receiptId: DEMO_RECEIPT_ID,
        verdict: bundle.receipt.verdict,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "demo_report.seed_failed",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});
