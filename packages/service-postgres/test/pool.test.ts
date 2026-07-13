import { describe, expect, it } from "vitest";

import {
  buildPostgresPoolConfig,
  resolvePostgresSsl,
} from "../src/pool.js";

describe("resolvePostgresSsl", () => {
  it("enables TLS for Supabase hosts when sslmode is absent", () => {
    expect(
      resolvePostgresSsl(
        "postgresql://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      ),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("stays disabled for local hosts without sslmode", () => {
    expect(
      resolvePostgresSsl("postgresql://postgres:postgres@127.0.0.1:5432/shipcheck"),
    ).toBeUndefined();
  });

  it("honors sslmode=disable even on Supabase hosts", () => {
    expect(
      resolvePostgresSsl(
        "postgresql://postgres@db.abc.supabase.co:5432/postgres?sslmode=disable",
      ),
    ).toBeUndefined();
  });

  it("uses DATABASE_CA_CERT for verify-full", () => {
    expect(
      resolvePostgresSsl(
        "postgresql://postgres@db.abc.supabase.co:5432/postgres?sslmode=verify-full",
        { DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----" },
      ),
    ).toEqual({
      rejectUnauthorized: true,
      ca: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----",
    });
  });
});

describe("buildPostgresPoolConfig", () => {
  it("strips sslmode from the URL and sets ssl so pg does not overwrite it", () => {
    expect(
      buildPostgresPoolConfig(
        "postgresql://postgres:secret@db.abc.supabase.co:5432/postgres?sslmode=require&pgbouncer=true",
      ),
    ).toEqual({
      connectionString:
        "postgresql://postgres:secret@db.abc.supabase.co:5432/postgres?pgbouncer=true",
      ssl: { rejectUnauthorized: false },
    });
  });
});
