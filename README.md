# ShipCheck

**Agents claim completion. ShipCheck produces acceptance.**

ShipCheck is an independent acceptance service for agent-built software. It compiles a natural-language brief into a typed contract, runs bounded public-web checks in an isolated browser, collects original evidence, and returns a deterministic receipt plus a human-readable report.

The language model may extract and classify requirements. It never awards the final verdict.

## Production

| Surface | URL |
|---|---|
| API | https://shipcheck.up.railway.app |
| Landing / reports | https://shipcheck-web.vercel.app |
| Demo report | https://shipcheck-web.vercel.app/reports/demo |
| Health | https://shipcheck.up.railway.app/health/live |

Unpaid `POST /v1/verify` returns **HTTP 402** with an OKX x402 `payment-required` challenge before any compile or browser work runs.

## Repository layout

```text
apps/
  api/              Express API, x402 payment boundary, production server
  web/              Landing page and unlisted report UI
  fixture-sites/    Deterministic demo and hostile fixtures
packages/           Domain, compiler, planner, adapters, stores, OKX/OpenAI
config/             Runtime acceptance + execution policy JSON (shipped in the image)
docs/               Specs, OpenAPI, ADRs, security, operations
scripts/            Demo and deployment verification helpers
Dockerfile          Railway production image (Playwright Chromium)
railway.toml        Build / pre-deploy migrate+seed / healthcheck
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
pnpm --filter @shipcheck/fixture-sites build
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

Reports are unlisted by unguessable receipt ID and omit full briefs and raw page content. Evidence uses short-lived signed links.

OpenAPI: [`docs/openapi.yaml`](docs/openapi.yaml)

## Configuration

Copy [`.env.example`](.env.example). Important variables:

| Variable | Purpose |
|---|---|
| `PUBLIC_BASE_URL` | Origin used for `reportUrl` (must be HTTPS in production) |
| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins (e.g. Vercel landing) |
| `DATABASE_URL` | PostgreSQL — Supabase **session pooler** from Railway |
| `TIGRIS_STORAGE_*` | S3-compatible evidence storage (`AWS_*` + `BUCKET_NAME` also OK) |
| `OPENAI_API_KEY` / `REQUIREMENT_COMPILER_MODEL` | Requirement compiler |
| `OKX_*`, `PAY_TO_ADDRESS`, `X402_NETWORK`, `SHIPCHECK_PRICE` | x402 payment |
| `OKX_SYNC_FACILITATOR_ON_START` | `true` in production so unpaid verify can return 402 |
| `VERIFICATION_ENABLED`, `BROWSER_EXECUTION_ENABLED` | Incident gates |
| `METRICS_BEARER_TOKEN` | Protect `/metrics` |
| `ALLOW_FREE_TEST_ROUTE` | Must be `false` in production |

Never put OKX secrets in browser workers.

Runtime policies loaded by the API live in [`config/`](config/) (`acceptance-policy.v1.json`, `execution-policy.v1.json`).

## Deployment

Production targets **Railway** (API + Chromium) with **Supabase** Postgres and private S3-compatible evidence storage (e.g. Tigris or R2). Allocate ≈4 GB RAM for Playwright. Landing may deploy separately on **Vercel** with `VITE_API_BASE_URL` pointing at the Railway origin.

```bash
# Deploy (Dockerfile + railway.toml)
railway up

# Smoke-check a deployed origin
BASE_URL=https://shipcheck.up.railway.app ./scripts/verify-deployment.sh

# Unpaid verify must return 402
curl -i -X POST "$BASE_URL/v1/verify" \
  -H 'content-type: application/json' \
  -d '{"brief":"Build a responsive launch page with pricing and a waitlist form.","deliveryUrl":"https://example.com","mode":"quick","maxRequirements":12}'
```

Pre-deploy runs migrations and seeds the demo report: `node dist/migrate-cli.js && node dist/seed-demo-cli.js`.

See:

- [`Dockerfile`](Dockerfile)
- [`railway.toml`](railway.toml)
- [`docs/DEPLOYMENT_AND_OPERATIONS.md`](docs/DEPLOYMENT_AND_OPERATIONS.md)

## Demo

```bash
export OPENAI_API_KEY='…'   # required for /v1/compile
pnpm --filter @shipcheck/fixture-sites build
./scripts/demo-90s.sh
```

The `/demo` fixture combines missing pricing, a failing waitlist path, and mobile overflow so a quick run can produce `CHANGES_REQUIRED` with evidence.

## Documentation

- Overview: [`docs/README.md`](docs/README.md)
- Product / SRS: [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md), [`docs/SRS.md`](docs/SRS.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- API & A2MCP: [`docs/API_AND_A2MCP.md`](docs/API_AND_A2MCP.md)
- Security: [`docs/SECURITY.md`](docs/SECURITY.md)
- ADRs: [`docs/ADRS.md`](docs/ADRS.md)
- Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md)

## License

[MIT](LICENSE)
