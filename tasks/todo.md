# ShipCheck V1 Task Checklist

## Current Slice

### Task 1: Reconcile canonical contracts

**Description:** Remove contradictions across the narrative specifications, JSON schemas, policies, examples, and OpenAPI document before implementation depends on them.

**Acceptance criteria:**

- [x] Requirement provenance and derived baselines have one schema representation.
- [x] Hash projections, result aggregation, verdict precedence, limits, and version provenance are explicit.
- [x] API endpoints and response contracts agree across documentation and OpenAPI.

**Verification:**

- [x] All JSON files parse and examples validate against the corrected schemas.
- [x] Cross-reference search finds no stale conflicting terminology.

**Dependencies:** None

**Files likely touched:** `developer-docs/docs/*`, `developer-docs/schemas/*`, `developer-docs/config/*`, `developer-docs/openapi.yaml`, `developer-docs/examples/*`

**Estimated scope:** Medium, split into provenance/hash and policy/API increments.

### Task 2: Bootstrap and prove the domain foundation

**Description:** Create the strict TypeScript workspace and implement schema-backed domain contracts plus deterministic canonicalization in a dependency-free domain package.

**Acceptance criteria:**

- [x] Strict types cover requests, requirements, contracts, checks, observations, results, evidence, and receipts.
- [x] Invalid enums, provenance, cross-field variants, and unknown properties are rejected.
- [x] Canonical JSON and SHA-256 output are stable and exclude self-referential fields.

**Verification:**

- [x] Tests fail before implementation and pass afterward.
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.

**Dependencies:** Task 1

**Files likely touched:** root workspace configuration and `packages/domain/*`

**Estimated scope:** Medium, split into workspace, schemas/types, and hashing increments.

## Later Slices

- [x] Deterministic result aggregation and acceptance policy
- [x] Evidence manifest and receipt construction
- [x] Requirement compiler boundary and constrained repair
- [ ] Requirement normalization and deduplication
- [ ] Finite execution planner
- [ ] Fixture sites and safe Playwright adapter
- [ ] Storage, queue, API, and idempotency
- [ ] OKX x402 payment boundary
- [ ] Agent response, report, landing, operations, and launch
