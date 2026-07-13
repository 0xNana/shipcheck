import type { Pool, PoolClient } from "pg";

export interface AdvisoryLock {
  tryAcquire(): Promise<boolean>;
  release(): Promise<void>;
}

export interface AdvisoryLockFactory {
  create(client: PoolClient): AdvisoryLock;
}

export class PostgresAdvisoryLock implements AdvisoryLock {
  constructor(
    private readonly client: PoolClient,
    private readonly lockKey: bigint,
  ) {}

  async tryAcquire(): Promise<boolean> {
    const result = await this.client.query<{ pg_try_advisory_lock: boolean }>(
      "SELECT pg_try_advisory_lock($1::bigint) AS pg_try_advisory_lock",
      [this.lockKey.toString()],
    );
    return result.rows[0]?.pg_try_advisory_lock ?? false;
  }

  async release(): Promise<void> {
    await this.client.query("SELECT pg_advisory_unlock($1::bigint)", [
      this.lockKey.toString(),
    ]);
  }
}

export class PostgresAdvisoryLockFactory implements AdvisoryLockFactory {
  constructor(private readonly lockKey: bigint) {}

  create(client: PoolClient): AdvisoryLock {
    return new PostgresAdvisoryLock(client, this.lockKey);
  }
}

export const RETENTION_ADVISORY_LOCK_KEY = 8_675_309_014n;

export async function withAdvisoryLock<T>(
  pool: Pool,
  lockFactory: AdvisoryLockFactory,
  action: () => Promise<T>,
): Promise<T | undefined> {
  const client = await pool.connect();
  const lock = lockFactory.create(client);
  try {
    const acquired = await lock.tryAcquire();
    if (!acquired) {
      return undefined;
    }
    return await action();
  } finally {
    await lock.release().catch(() => undefined);
    client.release();
  }
}
