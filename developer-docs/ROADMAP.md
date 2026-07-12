# ShipCheck Roadmap

## Product direction

ShipCheck begins as a public-web acceptance adapter but is designed around a broader primitive:

```text
Intent
→ executable acceptance contract
→ independent execution
→ evidence
→ deterministic verdict
→ payment and reputation
```

The roadmap separates the **acceptance protocol** from individual execution adapters.

## Phase 0 — Hackathon proof

### Objective

Demonstrate that ShipCheck can convert a natural-language landing-page brief into a typed acceptance contract, independently execute the objective requirements, and return an evidence-backed receipt.

### Deliverables

- A2MCP-compatible paid endpoint
- Requirement compiler
- Public-web Playwright adapter
- Deterministic acceptance policy
- Screenshot and trace evidence
- Human-readable report
- Machine-readable receipt
- 90-second production demo
- OKX.AI marketplace listing
- X launch post

### Supported scope

- one public HTTPS URL;
- one natural-language brief;
- up to 12 extracted requirements;
- Chromium desktop and one mobile viewport;
- content, links, basic forms, navigation, overflow, console, network, assets, metadata;
- limited same-origin execution;
- bounded synchronous quick mode.

### Excluded scope

- authentication;
- wallet interaction;
- checkout;
- file uploads;
- email verification;
- CAPTCHA;
- third-party account actions;
- visual taste scoring;
- security testing.

### Exit criteria

- The same contract and evidence set always produce the same verdict.
- Three deliberately broken demo sites produce expected failures.
- LLM failure cannot fabricate a passing receipt.
- Unsupported or subjective requirements are classified rather than guessed.
- Paid mode returns `HTTP 402` without payment and `HTTP 200` after valid payment.
- A complete receipt can be independently inspected.

## Phase 1 — Agent build-loop integration

### Objective

Make ShipCheck callable repeatedly by coding agents before they claim completion.

### Capabilities

- `compile_requirements`
- `verify_delivery`
- `retest_failures`
- receipt chaining
- affected-check selection
- CI webhook
- GitHub pull-request status output
- compact failure payload optimized for coding agents

### Loop

```text
builder agent
→ deploy
→ ShipCheck
→ structured failures
→ repair
→ retest
→ accepted receipt
```

### Exit criteria

- A coding agent can consume failures without human reformatting.
- Retests reuse the previous acceptance contract.
- Receipts form an auditable chain from first failure to acceptance.
- Regression checks do not silently drop prior critical requirements.

## Phase 2 — Specification-first workflow

### Objective

Move ShipCheck before implementation.

### Capabilities

- compile a brief before code exists;
- identify ambiguity and subjective requirements;
- suggest measurable clarifications;
- lock a versioned acceptance contract;
- produce a specification hash;
- let requester and builder approve the contract.

### Exit criteria

- A contract can be generated without a deployment.
- Every contract change creates a new version and hash.
- The final receipt identifies the exact specification version tested.

## Phase 3 — Expanded adapters

### API adapter

- OpenAPI-backed checks
- request/response schema validation
- status-code assertions
- idempotency checks
- safe test fixtures
- rate-limit behavior

### Authenticated web adapter

- encrypted temporary credentials;
- isolated browser contexts;
- login setup and teardown;
- role-based profiles;
- explicit approval for state-changing actions.

### Smart-contract and dApp adapter

- contract deployment verification;
- ABI function availability;
- read-call execution;
- testnet transactions;
- frontend-to-contract connectivity;
- event and receipt verification;
- chain, address, and bytecode evidence.

### Repository adapter

- branch/commit verification;
- file and symbol presence;
- unit-test execution in sandbox;
- build output;
- dependency and license checks.

All adapters must emit the same canonical `Observation` and `EvidenceArtifact` types.

## Phase 4 — Receipts and reputation

### Capabilities

- signed receipts;
- optional X Layer anchoring of:
  - specification hash;
  - delivery fingerprint;
  - evidence manifest hash;
  - verdict;
  - timestamp;
- verifier identifiers;
- receipt verification endpoint;
- reputation from accepted delivery history;
- dispute evidence bundles.

Do not put screenshots, traces, briefs, or private data onchain. Anchor hashes and minimal metadata.

## Phase 5 — Acceptance protocol

### Objective

Define a vendor-neutral protocol for machine-verifiable software acceptance.

### Components

- requirement contract schema;
- observation schema;
- evidence manifest;
- acceptance policy reference;
- receipt envelope;
- adapter capability declaration;
- verifier identity and signature;
- provenance chain;
- dispute and revocation semantics.

### Ecosystem direction

```text
requester agent
→ acceptance contract
→ builder agent
→ delivery
→ independent verifier
→ acceptance receipt
→ payment release / reputation update
```

## Permanent constraints

ShipCheck must never:

- infer a pass where execution evidence is absent;
- treat subjective language as objectively verified;
- let the LLM set the final verdict;
- hide unsupported requirements;
- execute destructive actions without an explicit authorization model;
- claim security assurance from functional acceptance testing;
- equate an accepted receipt with bug-free software.

## Backlog priorities

### High

- stable requirement DSL;
- false-pass prevention;
- SSRF and browser-worker isolation;
- evidence integrity;
- deterministic verdicting;
- compact agent-readable failures;
- retest workflow.

### Medium

- visual reference comparison;
- multi-page crawl;
- Firefox and WebKit projects;
- performance budgets;
- deeper accessibility checks;
- GitHub integration.

### Lower

- team dashboard;
- manual test-case editor;
- billing tiers;
- white-label reports;
- broad analytics;
- marketplace aggregation.
