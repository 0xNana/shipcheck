import { createPostgresPool, applyMigrations } from "@shipcheck/service-postgres";

async function main(): Promise<void> {
  const pool = createPostgresPool();
  const applied = await applyMigrations(pool);
  console.log(
    JSON.stringify({
      event: "migrations.applied",
      count: applied.length,
      files: applied,
    }),
  );
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
