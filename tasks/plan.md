# Implementation Plan: ShipCheck V1

## Overview

Build ShipCheck as a strict TypeScript monorepo that compiles delivery briefs into immutable acceptance contracts, executes only finite public-web checks, records independent evidence, and produces deterministic acceptance receipts. Work proceeds in small contract-first slices, beginning with reconciliation of the supplied specifications and schemas.

## Architecture Decisions

- Domain contracts are the dependency root; adapters may depend on them, but domain code has no network, clock, model, browser, database, or storage dependency.
- External inputs and third-party outputs are schema-validated at boundaries. Internal modules exchange typed values.
- Canonical hashes exclude their own hash field and all mutable delivery fields such as signed evidence URLs.
- Requirement-result aggregation and overall verdict selection are explicit deterministic policies with ordered precedence.
- The compiler emits a finite intent DSL. Only the execution planner can create executable check definitions.
- Public-web execution remains isolated, bounded, unauthenticated, and non-destructive throughout V1.

## Task List

### Phase 0: Contract Reconciliation

- [x] Task 1: Reconcile requirement provenance, derived-baseline representation, limits, and hash boundaries.
- [x] Task 2: Reconcile result aggregation, verdict precedence, receipt version provenance, and API surface.

### Checkpoint: Canonical Contracts

- [x] JSON schemas and narrative specifications agree.
- [x] Examples validate against their schemas.
- [x] Every deterministic decision has an explicit input, output, and precedence rule.

### Phase 1: Domain Foundation

- [x] Task 3: Bootstrap the pnpm TypeScript monorepo and `packages/domain`.
- [x] Task 4: Add schema-backed domain validators and branded identifiers.
- [x] Task 5: Add canonical JSON and SHA-256 helpers with golden tests.

### Checkpoint: Foundation

- [x] Domain tests pass.
- [x] Type checking and linting pass.
- [x] Package build succeeds without browser, network, model, or database access.

### Phase 2: Deterministic Acceptance

- [ ] Task 6: Implement observation-to-requirement-result aggregation.
- [ ] Task 7: Implement the pure acceptance policy and truth-table/property tests.
- [ ] Task 8: Implement evidence-manifest and receipt construction.

### Checkpoint: Deterministic Core

- [ ] Identical normalized inputs produce byte-equivalent policy output.
- [ ] Missing evidence cannot become `PASS`.
- [ ] Execution errors cannot become product failures.

### Phase 3: Compilation and Planning

- [ ] Task 9: Implement the schema-constrained compiler boundary with mock fixtures and one repair retry.
- [ ] Task 10: Implement normalization, deduplication, and allowed-intent enforcement.
- [ ] Task 11: Implement the finite execution planner.

### Checkpoint: Requirement-to-Plan

- [ ] Canonical briefs compile into expected atomic structures.
- [ ] Subjective, ambiguous, and unsupported requirements never become executable checks.
- [ ] Planner rejects unknown intents and unsafe parameters.

### Phase 4: Public-Web Adapter

- [ ] Task 12: Build controlled fixture sites for canonical and hostile scenarios.
- [ ] Task 13: Implement URL normalization, DNS/IP policy, and redirect validation.
- [ ] Task 14: Implement isolated Playwright execution, budgets, and safe check executors.
- [ ] Task 15: Implement observation normalization, screenshots, failure traces, and cleanup.

### Checkpoint: Safe Execution

- [ ] SSRF and blocked-action suites pass.
- [ ] Browser crashes yield incomplete execution, never product failure.
- [ ] Fixture sites produce the documented results and evidence.

### Phase 5: Service and Payment

- [ ] Task 16: Implement storage/queue interfaces and local fakes.
- [ ] Task 17: Implement typed API endpoints, idempotency, and structured errors.
- [ ] Task 18: Integrate the current official OKX x402 middleware before billable logic.

### Checkpoint: Paid Verification

- [ ] Unpaid requests return `402` without compilation or browser work.
- [ ] Paid replay is idempotent and produces a verifiable receipt.
- [ ] The bounded quick flow works end to end.

### Phase 6: Report, Operations, and Launch

- [ ] Task 19: Implement the report and landing experience.
- [ ] Task 20: Add metrics, safe logging, retention, health checks, and incident controls.
- [ ] Task 21: Complete deployment, marketplace registration, and the production demo.

### Checkpoint: V1 Complete

- [ ] All canonical, safety, payment, and end-to-end tests pass.
- [ ] Documentation and ADRs match the shipped behavior.
- [ ] Rollback and false-acceptance incident procedures are verified.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| False acceptance from ambiguous policy | High | Truth-table and property tests; no implicit precedence |
| SSRF or hostile-page worker compromise | High | Validate every destination; isolate workers; finite DSL and budgets |
| Non-reproducible receipts | High | Canonical serialization; explicit hash projections; golden vectors |
| Compiler invents or overstates requirements | High | Source provenance, schema constraints, allowlisted intents, fixtures |
| Payment work occurs before verification | High | Middleware boundary tests and instrumented billable-logic fake |
| Quick mode exceeds synchronous budgets | Medium | Enforce 12 total and 8 executable requirements plus wall-clock limits |

## Open Questions

- The production LLM provider/model remains intentionally undecided until the compiler interface and mock contract tests are stable.
- The concrete Postgres, Redis-compatible queue, and object-store providers remain deferred behind interfaces.
