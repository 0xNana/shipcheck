import { readFile, readdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import type { Pool } from "pg";

import { withTransaction } from "./client.js";

const MIGRATIONS_TABLE = "shipcheck_schema_migrations";

async function resolveMigrationsDirectory(
  explicit?: string,
): Promise<string> {
  if (explicit !== undefined) {
    return explicit;
  }

  const require = createRequire(import.meta.url);
  const candidates = [
    join(dirname(require.resolve("../package.json")), "migrations"),
    join(fileURLToPath(new URL("..", import.meta.url)), "migrations"),
    join(fileURLToPath(new URL(".", import.meta.url)), "migrations"),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }

  throw new Error(
    `Postgres migrations directory not found. Tried: ${candidates.join(", ")}`,
  );
}

export async function applyMigrations(
  pool: Pool,
  migrationsDirectory?: string,
): Promise<readonly string[]> {
  const directory = await resolveMigrationsDirectory(migrationsDirectory);
  const files = (await readdir(directory))
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
      const sql = await readFile(join(directory, fileName), "utf8");
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
