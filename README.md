# ShipCheck

**Agents claim completion. ShipCheck produces acceptance.**

ShipCheck is an independent acceptance service for agent-built software. It compiles a natural-language brief into a typed contract, runs bounded public-web checks in an isolated browser, collects original evidence, and returns a deterministic receipt plus a human-readable report.

The language model may extract and classify requirements. It never awards the final verdict.

## Repository layout

```text
apps/
  api/              Express API, x402 payment boundary, production server
  web/              Landing page and unlisted report UI
  fixture-sites/    Deterministic demo and hostile fixtures
packages/
  domain/           Schema-backed contracts and hashing
  acceptance-policy/
  requirement-compiler/
  execution-planner/
  public-web-adapter/
  evidence-store/
  evidence-tigris/
  service-core/
  service-postgres/
  service-ops/
  service-retention/
  okx-a2mcp/
  openai-compiler/
  report-view/
developer-docs/     Product specs, OpenAPI, ADRs, marketplace listing
scripts/            Demo and deployment verification helpers
```

## Requirements

- Node.js 22+
- pnpm 10+
- Chromium (local Playwright path or the production Docker image)
- PostgreSQL and S3-compatible object storage for production

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

Local API (after filling `.env`):

```bash
pnpm --filter @shipcheck/api start
```

Local web UI (proxies `/v1` and `/health` to the API):

```bash
pnpm --filter @shipcheck/web dev
```

Fixture sites for adapter tests and demos:

```bash
pnpm --filter @shipcheck/fixture-sites start
```

## API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health`, `/health/live`, `/health/ready` | Liveness and readiness |
| `POST` | `/v1/compile` | Compile a brief into an acceptance contract |
| `POST` | `/v1/verify` | Paid quick verification (x402) |
| `GET` | `/v1/requests/:requestId` | Request status |
| `GET` | `/v1/receipts/:receiptId` | Machine-readable receipt |
| `GET` | `/v1/receipts/:receiptId/verify` | Receipt hash check |
| `GET` | `/v1/reports/:receiptId` | Unlisted human report bundle |
| `GET` | `/metrics` | Prometheus metrics (bearer token) |

Unpaid `/v1/verify` calls return `HTTP 402`. Reports are unlisted by unguessable receipt ID and omit full briefs and raw page content. Evidence uses short-lived signed links.

OpenAPI: [`developer-docs/openapi.yaml`](developer-docs/openapi.yaml)

## Configuration

Copy [`.env.example`](.env.example). Important variables:

- `PUBLIC_BASE_URL` — origin used for `reportUrl`
- `DATABASE_URL` — PostgreSQL connection
- `OBJECT_STORE_*` — Tigris/S3 evidence storage
- `OPENAI_API_KEY` / `REQUIREMENT_COMPILER_MODEL` — compiler model
- `OKX_*`, `PAY_TO_ADDRESS`, `X402_NETWORK`, `SHIPCHECK_PRICE` — payment
- `VERIFICATION_ENABLED`, `BROWSER_EXECUTION_ENABLED` — incident gates
- `METRICS_BEARER_TOKEN` — protect `/metrics`
- `ALLOW_FREE_TEST_ROUTE` — must be `false` in production

Never put OKX secrets in browser workers.

## Deployment

Production targets Fly.io with Managed Postgres and private Tigris storage.

```bash
# Build locally or via Fly remote builder
fly deploy

# Smoke-check a deployed origin
./scripts/verify-deployment.sh https://your-app.fly.dev
```

See:

- [`Dockerfile`](Dockerfile)
- [`fly.toml`](fly.toml)
- [`developer-docs/docs/09_DEPLOYMENT_AND_OPERATIONS.md`](developer-docs/docs/09_DEPLOYMENT_AND_OPERATIONS.md)
- [`developer-docs/marketplace/listing.md`](developer-docs/marketplace/listing.md)

## Demo

```bash
./scripts/demo-90s.sh
```

The `/demo` fixture combines missing pricing, a failing waitlist path, and mobile overflow so a quick run can produce `CHANGES_REQUIRED` with evidence.

## Documentation

- Product and architecture: [`developer-docs/`](developer-docs/)
- Task plan: [`tasks/plan.md`](tasks/plan.md)
- ADRs: [`developer-docs/docs/12_ADRS.md`](developer-docs/docs/12_ADRS.md)

## License

Private / unpublished unless otherwise noted.
