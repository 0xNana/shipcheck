import { Pool, type PoolConfig } from "pg";

export interface PostgresPoolOptions {
  readonly connectionString?: string;
  readonly poolConfig?: PoolConfig;
}

export function createPostgresPool(
  options: PostgresPoolOptions = {},
): Pool {
  const connectionString =
    options.connectionString ?? process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString.length === 0) {
    throw new TypeError("DATABASE_URL is required to create a Postgres pool");
  }
  return new Pool({
    connectionString,
    ...options.poolConfig,
  });
}
