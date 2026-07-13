import { Pool, type PoolConfig } from "pg";

export interface PostgresPoolOptions {
  readonly connectionString?: string;
  readonly poolConfig?: PoolConfig;
  readonly env?: NodeJS.ProcessEnv;
}

type SslConfig = NonNullable<PoolConfig["ssl"]>;

function asHttpUrl(connectionString: string): URL {
  return new URL(connectionString.replace(/^postgres(ql)?:/iu, "http:"));
}

function toPostgresConnectionString(url: URL): string {
  return `postgresql:${url.toString().slice("http:".length)}`;
}

function isManagedSslHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.endsWith(".supabase.co") ||
    host.endsWith(".supabase.com") ||
    host.includes("pooler.supabase")
  );
}

function sslModeFrom(
  connectionString: string,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const url = asHttpUrl(connectionString);
  const fromUrl = url.searchParams.get("sslmode");
  if (fromUrl !== null && fromUrl.trim().length > 0) {
    return fromUrl.trim().toLowerCase();
  }
  const fromEnv = env["DATABASE_SSLMODE"] ?? env["PGSSLMODE"];
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    return fromEnv.trim().toLowerCase();
  }
  if (isManagedSslHost(url.hostname)) {
    return "require";
  }
  return undefined;
}

function normalizeCaCert(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/gu, "\n") : value;
}

/**
 * Resolve TLS settings for managed Postgres (e.g. Supabase).
 * Strips reliance on URI `sslmode` alone — node-pg can treat `require` as
 * verify-full and overwrite an explicit `ssl` object when sslmode is present.
 * @see https://node-postgres.com/features/ssl
 * @see https://supabase.com/docs/guides/platform/ssl-enforcement
 */
export function resolvePostgresSsl(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): SslConfig | undefined {
  const mode = sslModeFrom(connectionString, env);
  if (mode === undefined || mode === "disable") {
    return undefined;
  }

  const caRaw = env["DATABASE_CA_CERT"] ?? env["PGSSLROOTCERT"];
  const ca =
    caRaw !== undefined && caRaw.trim().length > 0
      ? normalizeCaCert(caRaw.trim())
      : undefined;

  if (mode === "verify-full" || mode === "verify-ca" || ca !== undefined) {
    return {
      rejectUnauthorized: true,
      ...(ca === undefined ? {} : { ca }),
    };
  }

  if (
    mode === "require" ||
    mode === "prefer" ||
    mode === "allow" ||
    isManagedSslHost(asHttpUrl(connectionString).hostname)
  ) {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

export function sanitizePostgresConnectionString(
  connectionString: string,
): string {
  const url = asHttpUrl(connectionString);
  for (const key of [
    "sslmode",
    "sslcert",
    "sslkey",
    "sslrootcert",
    "sslnegotiation",
  ]) {
    url.searchParams.delete(key);
  }
  return toPostgresConnectionString(url);
}

export function buildPostgresPoolConfig(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
  poolConfig: PoolConfig = {},
): PoolConfig {
  const ssl =
    poolConfig.ssl !== undefined
      ? poolConfig.ssl
      : resolvePostgresSsl(connectionString, env);
  const { ssl: _ignored, ...restPoolConfig } = poolConfig;
  void _ignored;

  return {
    connectionString:
      ssl === undefined
        ? connectionString
        : sanitizePostgresConnectionString(connectionString),
    ...restPoolConfig,
    ...(ssl === undefined ? {} : { ssl }),
  };
}

export function createPostgresPool(
  options: PostgresPoolOptions = {},
): Pool {
  const env = options.env ?? process.env;
  const connectionString =
    options.connectionString ?? env["DATABASE_URL"];
  if (connectionString === undefined || connectionString.length === 0) {
    throw new TypeError("DATABASE_URL is required to create a Postgres pool");
  }
  return new Pool(
    buildPostgresPoolConfig(connectionString, env, options.poolConfig ?? {}),
  );
}
