# Software Requirements Specification

## 1. Purpose

This document specifies ShipCheck V1, a paid A2MCP service that converts a natural-language public-web delivery brief into executable acceptance requirements and returns an evidence-backed verdict.

## 2. Actors

| Actor | Responsibility |
|---|---|
| Caller agent | Submits brief and delivery URL; consumes receipt |
| Requirement compiler | Extracts and classifies atomic requirements |
| Execution planner | Maps executable requirements to supported checks |
| Browser worker | Performs bounded public-web interactions |
| Evidence store | Persists screenshots, traces, and metadata |
| Acceptance engine | Computes final verdict from results |
| OKX payment layer | Challenges, verifies, and settles paid calls |
| Operator | Deploys, monitors, and manages versions |

## 3. Functional requirements

### FR-001 — Accept request

The service shall accept:

- `brief`: non-empty natural-language text;
- `deliveryUrl`: public `https://` URL;
- optional `maxRequirements`;
- optional `mode`: `quick` (the only V1 execution mode);
- optional metadata not used as evidence.

### FR-002 — Validate target

Reject:

- non-HTTPS URLs in production;
- localhost and loopback;
- private, link-local, multicast, and reserved IP ranges;
- embedded credentials;
- unsupported schemes;
- redirects or DNS rebinding to blocked ranges.

### FR-003 — Compile requirements

Each requirement must contain:

- unique ID;
- normalized statement;
- provenance as either an exact zero-based `[start, end)` source span or a derived-baseline rationale;
- class;
- priority;
- confidence;
- allowed intent representing the expected observable;
- `PUBLIC_WEB` adapter for executable V1 requirements;
- clarification text where applicable.

### FR-004 — Requirement classes

- `EXECUTABLE`
- `AMBIGUOUS`
- `SUBJECTIVE`
- `UNSUPPORTED`

### FR-005 — Priorities

- `CRITICAL`
- `REQUIRED`
- `OPTIONAL`

If priority is not explicit, default to `REQUIRED` and mark the source as default.

### FR-006 — Acceptance contract

Create an immutable contract with:

- contract schema version;
- normalized target;
- requirements;
- compiler version;
- policy version;
- execution policy version;
- contract hash;
- timestamp.

### FR-007 — Plan execution

Map each executable requirement to one or more finite check definitions.

A requirement without a safe supported check becomes `UNSUPPORTED`, never passed.

### FR-008 — Execute checks

The worker shall:

- create a fresh isolated browser context;
- enforce time and navigation budgets;
- perform only allowlisted actions;
- capture observations;
- stop on unsafe transitions;
- close and release resources.

### FR-009 — Gather evidence

Evidence types include:

- screenshot;
- element screenshot;
- DOM excerpt or accessibility snapshot;
- network record;
- console record;
- HTTP response metadata;
- trace;
- normalized observation.

### FR-010 — Requirement result

Exactly one:

- `PASS`
- `FAIL`
- `UNVERIFIED`
- `NOT_OBJECTIVELY_TESTABLE`
- `UNSUPPORTED`

### FR-011 — Overall verdict

Exactly one:

- `ACCEPTED`
- `ACCEPTED_WITH_NOTES`
- `CHANGES_REQUIRED`
- `INSUFFICIENT_SPECIFICATION`
- `EXECUTION_INCOMPLETE`

The LLM shall not supply or override the verdict.

### FR-012 — Actionable failure

Each failure includes:

- requirement;
- observed state;
- expected state;
- evidence;
- concise repair guidance;
- rerun eligibility.

### FR-013 — Acceptance receipt

Return a receipt conforming to `schemas/acceptance-receipt.schema.json`.

### FR-014 — Paid endpoint

Paid mode shall:

1. return x402-compatible `HTTP 402` without valid payment;
2. verify payment before billable execution;
3. return result after successful verification;
4. prevent replay.

### FR-015 — Free/test mode

A separate free or testnet route may exist. It must not silently bypass payment on the production paid route.

### FR-016 — Idempotency

A caller may submit an idempotency key. The same completed request must not be charged or executed twice within the retention window.

## 4. Non-functional requirements

### NFR-001 — Determinism

Identical contract and normalized observations must produce byte-equivalent verdict output excluding timestamps and signatures.

### NFR-002 — Auditability

Every pass/failure must trace to:

- requirement;
- check definition;
- observation;
- policy version;
- evidence reference.

### NFR-003 — Safety

The V1 worker must not:

- authenticate;
- enter payment information;
- connect a wallet;
- upload files;
- download executables;
- submit destructive forms;
- accept permission prompts;
- interact with non-allowlisted third-party domains beyond safe link checks.

### NFR-004 — Isolation

Each run uses an isolated, non-persistent browser context. State is never reused between customers.

### NFR-005 — Failure semantics

A compiler failure does not produce a receipt. A browser infrastructure failure returns `EXECUTION_INCOMPLETE`, not `FAIL`.

### NFR-006 — Performance budget

Quick mode defaults:

- up to 8 executable requirements;
- up to 12 total requirements;
- one desktop viewport;
- one mobile viewport;
- bounded wall-clock budget;
- bounded evidence size.

### NFR-007 — Privacy

Briefs, screenshots, and traces are potentially sensitive. Evidence URLs must be unguessable and expire.

### NFR-008 — Accessibility

The report must not communicate verdict solely through color.

## 5. V1 acceptance criteria

- Brief decomposes into atomic requirements.
- Subjective language is never passed.
- Broken links, forms, and mobile overflow are detected.
- Browser failure cannot become a product failure.
- Receipt hashes change when specification, target, evidence, or verdict changes.
- Paid endpoint follows the current OKX x402 flow.
