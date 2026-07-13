import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

export type Queryable = Pick<Pool, "query">;

export type QueryableClient = Queryable & Pick<PoolClient, "release">;

export async function withTransaction<T>(
  pool: Pool,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function queryRows<TRow extends QueryResultRow>(
  db: Queryable,
  text: string,
  values?: readonly unknown[],
): Promise<TRow[]> {
  const result: QueryResult<TRow> = await db.query<TRow>(text, [...(values ?? [])]);
  return result.rows;
}
