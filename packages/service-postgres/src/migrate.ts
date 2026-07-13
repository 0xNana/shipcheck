import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

import { withTransaction } from "./client.js";

const MIGRATIONS_TABLE = "shipcheck_schema_migrations";

export async function applyMigrations(
  pool: Pool,
  migrationsDirectory = join(
    fileURLToPath(new URL("..", import.meta.url)),
    "migrations",
  ),
): Promise<readonly string[]> {
  const files = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const applied: string[] = [];

  await withTransaction(pool, async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const fileName of files) {
      const existing = await client.query<{ name: string }>(
        `SELECT name FROM ${MIGRATIONS_TABLE} WHERE name = $1`,
        [fileName],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        continue;
      }
      const sql = await readFile(join(migrationsDirectory, fileName), "utf8");
      await client.query(sql);
      await client.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`,
        [fileName],
      );
      applied.push(fileName);
    }
  });

  return applied;
}
