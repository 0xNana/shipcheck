# Deployment and Operations

## Services

### API service

- x402 middleware;
- validation;
- idempotency;
- compiler invocation;
- job orchestration;
- receipt response.

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

See `.env.example`.

Never place OKX API secrets in browser workers.

## Health

- `GET /health` for API readiness;
- internal liveness/readiness probes for workers.

## Metrics

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
- idempotency hits;
- payment failures.

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
