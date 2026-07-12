# Codex Build Plan

## Mission

Implement ShipCheck V1 as a TypeScript monorepo with a paid OKX.AI A2MCP endpoint, schema-constrained requirement compiler, safe Playwright worker, deterministic acceptance policy, and evidence-backed receipt.

## Non-negotiable rules

1. The LLM cannot set the final verdict.
2. The compiler cannot emit arbitrary code, selectors, shell commands, or unrestricted URLs.
3. No `PASS` without an observation.
4. Browser/system errors are not product failures.
5. Every navigation is subject to SSRF checks.
6. V1 is public and unauthenticated only.
7. Payment middleware runs before billable logic.
8. The receipt identifies every version used.

## Monorepo

```text
apps/
  api/
  worker/
  landing/
packages/
  domain/
  requirement-compiler/
  execution-planner/
  playwright-adapter/
  acceptance-policy/
  evidence-store/
  okx-a2mcp/
```

## Implementation order

### 1 — Domain and schemas

Implement types and validators for:

- request;
- requirement;
- contract;
- check definition;
- observation;
- result;
- evidence;
- receipt.

Definition of done:

- schemas compile;
- invalid enums/source spans fail;
- canonical JSON helper exists.

Hash projections must omit their self-referential hash field. Contract canonicalization omits `contractHash`; receipt canonicalization omits `receiptHash`, signatures, and anchors.

### 2 — Acceptance policy

Pure function:

```typescript
determineAcceptance(
  contract: AcceptanceContract,
  results: RequirementResult[],
  policy: AcceptancePolicy,
  executionStatus: "COMPLETED" | "SYSTEMIC_FAILURE",
): OverallVerdict
```

No network, clock, model, or DB dependency.

Implement the ordered precedence in `config/acceptance-policy.v1.json`; do not infer precedence from object-key order or prose.

`SYSTEMIC_FAILURE` is an explicit normalized orchestration input. Do not infer it from a single `UNVERIFIED` requirement.

### 3 — Compiler adapter

Implement:

- prompt builder;
- model interface;
- schema validation;
- one repair retry;
- normalization/deduplication;
- allowed-intent enforcement.

Start with mocked compiler fixtures.

### 4 — Execution planner

Map allowed intents to finite checks. Reject unsupported parameters.

### 5 — Fixture sites

Create fixtures for every canonical scenario.

### 6 — Safe Playwright worker

Implement:

- isolated context;
- URL guard;
- request interception;
- budgets;
- check executors;
- observations;
- screenshots;
- traces on failure;
- cleanup.

### 7 — Evidence and receipt

Implement object-store interface, hashes, receipt, and expiring evidence URLs.

### 8 — API

```text
POST /v1/verify
POST /v1/compile
GET /v1/requests/:id
GET /v1/receipts/:id
GET /v1/receipts/:id/verify
GET /health
```

### 9 — x402

Integrate the current official OKX Node.js packages in `packages/okx-a2mcp`.

### 10 — Report and landing

Landing message:

> Agents claim completion. ShipCheck produces acceptance.

Report shows:

- verdict;
- requirement counts;
- evidence;
- receipt hash.

### 11 — Agent response

```json
{
  "verdict": "CHANGES_REQUIRED",
  "failures": [
    {
      "requirement": "Waitlist form accepts a valid email",
      "observed": "POST /api/waitlist returned 500",
      "repairHint": "Inspect the waitlist API and return a visible success state."
    }
  ],
  "retestToken": "..."
}
```

## Quality rules

- strict TypeScript;
- no `any` in domain packages;
- exhaustive enums;
- structured errors;
- DI for model/storage/payment/browser;
- tests before fixes;
- ADR for scope changes.

## Stop conditions

Do not add:

- auth;
- smart contracts;
- GitHub;
- dashboards;
- arbitrary test generation;
- taste scoring;
- continuous monitoring;

until V1 works end to end.
