import { setDefaultResultOrder } from "node:dns";

import { createPostgresPool, applyMigrations } from "@shipcheck/service-postgres";

setDefaultResultOrder("ipv4first");

function redactDatabaseUrl(value: string): string {
  try {
    const url = new URL(value.replace(/^postgres(ql)?:/iu, "http:"));
    return `${url.hostname}:${url.port || "5432"}/${url.pathname.replace(/^\//u, "")}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function assertRailwayReachableDatabaseUrl(value: string): void {
  try {
    const url = new URL(value.replace(/^postgres(ql)?:/iu, "http:"));
    const host = url.hostname.toLowerCase();
    if (host.startsWith("db.") && host.endsWith(".supabase.co")) {
      throw new TypeError(
        `DATABASE_URL uses Supabase direct host '${host}' which is IPv6-only; Railway cannot reach it (ENETUNREACH). Use the Session pooler URL (*.pooler.supabase.com:5432).`,
      );
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("Session pooler")) {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new TypeError("DATABASE_URL is required for migrations");
  }
  assertRailwayReachableDatabaseUrl(databaseUrl);

  console.log(
    JSON.stringify({
      event: "migrations.start",
      target: redactDatabaseUrl(databaseUrl),
    }),
  );

  const pool = createPostgresPool({ connectionString: databaseUrl });
  try {
    const applied = await applyMigrations(pool);
    console.log(
      JSON.stringify({
        event: "migrations.applied",
        count: applied.length,
        files: applied,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;
  console.error(
    JSON.stringify({
      event: "migrations.failed",
      message,
      ...(code === undefined ? {} : { code }),
    }),
  );
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});
