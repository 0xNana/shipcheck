# OKX Marketplace Listing

## Product name

ShipCheck Quick Acceptance

## One-line summary

Compile a delivery brief into an immutable acceptance contract, run bounded public-web checks, and return a deterministic receipt with evidence links.

## Description

ShipCheck turns a plain-language delivery brief into machine-verifiable acceptance requirements, executes only safe public-web checks, and publishes an independent receipt that buyers, agents, and operators can replay later. Verification is paid through OKX x402 before any compiler or browser work begins.

## Primary endpoint

- `POST /v1/verify` — paid quick verification
- `GET /v1/reports/:receiptId` — human-readable report
- `GET /v1/receipts/:receiptId/verify` — receipt hash check

## Pricing

- Default: `$0.01` USDC on the configured `X402_NETWORK`
- Price is enforced by OKX x402 middleware before billable logic

## Supported inputs

- HTTPS public delivery URLs only
- Briefs up to the configured requirement limit
- Quick mode for bounded public-web verification

## Evidence and retention

- Screenshots, traces, and manifests stored in object storage
- Signed evidence links expire quickly and are never logged
- Retention windows controlled by `EVIDENCE_RETENTION_DAYS`, `REQUEST_RETENTION_DAYS`, and `RECEIPT_RETENTION_DAYS`

## Operational guarantees

- Unpaid requests receive `402 Payment Required`
- Idempotent replays return the original receipt
- Incident gates can disable verification or browser execution without redeploying code

## Marketplace checklist

- [ ] Register seller wallet (`PAY_TO_ADDRESS`) on the target network
- [ ] Configure OKX API credentials (`OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`)
- [ ] Set `PUBLIC_BASE_URL` to the deployed HTTPS origin
- [ ] Set `METRICS_BEARER_TOKEN` and restrict `/metrics` access
- [ ] Verify `/health/live` and `/health/ready` on Railway
- [ ] Run `scripts/verify-deployment.sh` after deploy
- [ ] Run `scripts/demo-90s.sh` against fixture sites before listing
- [ ] Confirm unpaid `POST /v1/verify` returns `402`
- [ ] Confirm paid replay returns `Idempotency-Replayed: true`
- [ ] Attach sample receipt URL and report URL to the listing

## Support statement

ShipCheck does not claim subjective quality, security certification, or production readiness. Receipts describe objective public-web observations captured under the published policy versions embedded in each receipt.
