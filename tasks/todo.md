# ShipCheck V1 Task Checklist

## Current Slice

V1 implementation complete. External launch steps remain manual:

- Provision Fly.io app, Managed Postgres, and Tigris bucket
- Set secrets from `.env.example`
- Run `scripts/verify-deployment.sh` against production URL
- Submit OKX marketplace listing using `developer-docs/marketplace/listing.md`
- Record 90-second demo with `scripts/demo-90s.sh`

## Completed Slices

- [x] Deterministic result aggregation and acceptance policy
- [x] Evidence manifest and receipt construction
- [x] Requirement compiler boundary and constrained repair
- [x] Requirement normalization and deduplication
- [x] Finite execution planner
- [x] Fixture sites and safe Playwright adapter
- [x] Storage, queue, API, and idempotency
- [x] OKX x402 payment boundary
- [x] Agent response, report, landing, operations, and launch
