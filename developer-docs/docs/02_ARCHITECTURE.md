# Architecture and Data Flow

## Context diagram

```mermaid
flowchart LR
    C[Caller Agent / Human]
    O[OKX.AI + x402 Payment]
    A[ShipCheck API]
    RC[Requirement Compiler]
    AP[Acceptance Policy]
    Q[(Job Queue)]
    W[Browser Worker]
    E[(Evidence Store)]
    R[(Receipt Store)]
    X[X Layer Anchor - Optional]

    C -->|brief + URL| O
    O -->|paid request| A
    A --> RC
    RC -->|acceptance contract| A
    A --> Q
    Q --> W
    W -->|observations + artifacts| E
    W --> A
    A --> AP
    AP -->|verdict| A
    A --> R
    R -.hash anchor.-> X
    A -->|receipt + report| O
    O --> C
```

## Level 0 DFD

```mermaid
flowchart TB
    I[Request]
    V((1. Validate Target))
    C((2. Compile Requirements))
    P((3. Build Execution Plan))
    B((4. Execute in Browser))
    G((5. Gather Evidence))
    D((6. Determine Verdict))
    H((7. Hash and Return Receipt))

    I --> V --> C --> P --> B --> G --> D --> H
```

## Trust boundaries

### Public API

All fields are untrusted. The target URL is an SSRF vector.

### LLM compiler

Compiler output is untrusted until schema-validated and normalized. It cannot issue arbitrary code or browser instructions.

### Browser worker

The destination is hostile. It can redirect, fingerprint, attempt downloads, open popups, consume resources, and target internal networks.

### Evidence store

Evidence may contain target-site data. Access must be scoped and time-limited.

### Payment

Payment verification is delegated to the official OKX x402 integration. Business logic must not run before paid-route middleware succeeds.

## Components

### API gateway

- validation;
- payment middleware;
- idempotency;
- request status;
- response serialization;
- rate limits.

### Requirement compiler

- semantic extraction;
- atomic decomposition;
- classification;
- source-span preservation;
- clarification;
- no verdicting.

### Contract validator

- JSON Schema validation;
- bounds;
- adapter validation;
- duplicate merging;
- unsafe instruction rejection.

### Execution planner

Maps requirement intent into a finite DSL. It never emits arbitrary JavaScript.

### Browser worker

Executes the DSL with Playwright in an isolated container.

### Evidence normalizer

Converts raw browser output into canonical observations.

### Acceptance policy

Pure function:

```typescript
determineVerdict(contract, requirementResults, policy): AcceptanceVerdict
```

### Receipt builder

Canonicalizes and hashes:

- contract;
- target fingerprint;
- results;
- evidence manifest;
- policy identifiers.

## Deployment topology

```text
Edge/API service
    ↓
Redis-compatible queue
    ↓
Containerized browser workers
    ↓
Object storage for evidence
    ↓
Postgres for contracts, jobs, and receipts
```

Avoid running Chromium inside a constrained edge function. Keep the payment/API path separate from the isolated browser workload.
