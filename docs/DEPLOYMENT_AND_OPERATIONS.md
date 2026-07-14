# Deployment and Operations

## Services

### API service

- x402 middleware;
- validation;
- idempotency;
- compiler invocation;
- job orchestration;
- receipt response;
- structured logging and Prometheus metrics;
- static web report shell.

### Browser worker

- safe navigation;
- execution DSL;
- evidence capture;
- cleanup.

### Data

- Postgres: requests, contracts, observations, receipts;
- Redis-compatible queue/cache: jobs, locks, idempotency;
- object storage: screenshots and traces.

## Environment

See `.env.example` at the repository root.

Never place OKX API secrets in browser workers.

## Railway

Production deploys as one Railway service from the root `Dockerfile` ([config as code](https://docs.railway.com/config-as-code/reference)).

- Builder: `DOCKERFILE` via [`railway.toml`](../../railway.toml)
- Pre-deploy: `node dist/migrate-cli.js && node dist/seed-demo-cli.js` ([pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command); Railway allows one command string)
- Healthcheck: `GET /health/live`
- Bind: process listens on `0.0.0.0:$PORT`
- Data: Supabase Postgres (`DATABASE_URL`) + S3-compatible evidence credentials (`TIGRIS_STORAGE_*` or `AWS_*`)
- TLS: Supabase hosts auto-enable SSL in `createPostgresPool` (override with `DATABASE_SSLMODE` / `DATABASE_CA_CERT`)
- `DATABASE_URL`: use the Supabase **Session pooler** (`*.pooler.supabase.com:5432`) from Railway (IPv4). Avoid the direct `db.*.supabase.co` host (often IPv6-only) and prefer session mode over transaction mode (`:6543`) for migrations.
- Size: allocate enough memory for Playwright Chromium (≈4 GB)

Set `PUBLIC_BASE_URL` to the Railway HTTPS origin (custom domain or `*.up.railway.app`).

When the landing runs on Vercel and the API on Railway, set `CORS_ALLOWED_ORIGINS` on the API to a comma-separated list of browser origins (for example `https://shipcheck-web.vercel.app`). The Railway-hosted SPA origin can be included if you serve reports from the same API host.

## Health

- `GET /health` — backward-compatible `{ "status": "ok" }`;
- `GET /health/live` — process liveness, no external calls;
- `GET /health/ready` — config validation plus optional Postgres ping. Readiness does not invoke OpenAI or OKX.

## Metrics

Prometheus exposition is available at `GET /metrics` and requires `Authorization: Bearer ${METRICS_BEARER_TOKEN}`.

Recorded series include:

- requests;
- paid requests;
- compiler failures;
- requirements per contract;
- executable ratio;
- run duration;
- browser crashes;
- verdict distribution;
- evidence bytes;
- SSRF blocks;
- blocked actions;
- idempotency hits and conflicts;
- payment failures;
- persistence failures.

## Logging

Include:

- request ID;
- receipt ID;
- versions;
- stage;
- error code.

Exclude:

- payment secrets;
- full briefs by default;
- form values;
- signed evidence URLs;
- raw page content.

## Incident gates

Set these environment flags to disable billable or risky paths without redeploying code:

- `VERIFICATION_ENABLED=false` — returns `503 EXECUTION_UNAVAILABLE` on `POST /v1/verify` before payment settlement or compiler/browser work;
- `BROWSER_EXECUTION_ENABLED=false` — blocks browser execution while leaving compile-only routes available.

## Incidents

### SEV-0 — False acceptance

- disable paid verification;
- preserve receipts/evidence;
- identify affected versions;
- revoke or mark receipts;
- add regression test before restoration.

### SEV-1 — Isolation or data exposure

Disable browser execution and rotate credentials.

### SEV-2 — Payment or availability outage

Return clear transport errors; never manufacture verdicts.

### SEV-3 — Evidence rendering issue

Receipt may remain valid if observations are intact, but disclose missing artifacts.

## Versioning

Version independently:

- compiler prompt/model;
- requirement schema;
- execution adapter;
- acceptance policy;
- receipt schema.

Historical receipts must remain verifiable under original versions.

## Release checklist

- migrations applied;
- canonical tests pass;
- SSRF suite passes;
- unpaid route returns 402;
- testnet purchase succeeds;
- browser patched;
- evidence expiry tested;
- demo fixture validated;
- endpoint reachable globally.
