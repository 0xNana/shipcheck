# ShipCheck

**ShipCheck is the acceptance layer for agent-built software.**

It converts a natural-language delivery brief into an executable acceptance contract, independently tests the delivered public website, collects original evidence, and returns a deterministic acceptance verdict.

> Human intent in. Verifiable acceptance out.

## Product category

- **Category:** Agent Acceptance Layer
- **Mechanism:** Requirement-to-Proof Engine
- **Initial execution adapter:** Public web applications
- **Primary customer:** AI coding agents
- **Secondary customer:** Humans receiving AI-built software

## Core pipeline

```text
Natural-language brief
        ↓
Requirement compiler
        ↓
Typed acceptance contract
        ↓
Execution planner
        ↓
Playwright browser worker
        ↓
Evidence records
        ↓
Deterministic acceptance policy
        ↓
Acceptance receipt
```

The language model may extract, normalize, classify, and clarify requirements. It may not determine the final acceptance verdict. The verdict is produced by a versioned policy engine from observed execution results.

## V1 scope

ShipCheck V1 verifies **public, unauthenticated landing pages and simple public web flows**.

Supported checks:

- required text, sections, and page elements;
- internal link resolution;
- CTA destinations;
- basic, non-destructive form submission;
- desktop and mobile navigation;
- horizontal overflow;
- missing images and assets;
- browser console errors;
- failed same-origin network requests;
- HTTPS;
- title and metadata;
- basic accessibility signals.

Explicitly unsupported in V1:

- authenticated applications;
- payments or wallet transactions;
- destructive actions;
- penetration testing;
- native mobile applications;
- complex multi-user workflows;
- subjective aesthetic judgments;
- arbitrary code execution;
- third-party accounts or CAPTCHA bypass.

## Verdicts

Per requirement:

- `PASS`
- `FAIL`
- `UNVERIFIED`
- `NOT_OBJECTIVELY_TESTABLE`
- `UNSUPPORTED`

Overall:

- `ACCEPTED`
- `ACCEPTED_WITH_NOTES`
- `CHANGES_REQUIRED`
- `INSUFFICIENT_SPECIFICATION`
- `EXECUTION_INCOMPLETE`

## Developer entry points

- Product specification: [`docs/00_PRODUCT_SPEC.md`](docs/00_PRODUCT_SPEC.md)
- System requirements: [`docs/01_SRS.md`](docs/01_SRS.md)
- Architecture and DFDs: [`docs/02_ARCHITECTURE.md`](docs/02_ARCHITECTURE.md)
- Requirement compiler: [`docs/03_REQUIREMENT_COMPILER.md`](docs/03_REQUIREMENT_COMPILER.md)
- Execution engine: [`docs/04_EXECUTION_ENGINE.md`](docs/04_EXECUTION_ENGINE.md)
- Evidence and receipts: [`docs/05_EVIDENCE_AND_RECEIPTS.md`](docs/05_EVIDENCE_AND_RECEIPTS.md)
- API and OKX.AI integration: [`docs/06_API_AND_A2MCP.md`](docs/06_API_AND_A2MCP.md)
- Security: [`docs/07_SECURITY.md`](docs/07_SECURITY.md)
- Testing: [`docs/08_TESTING.md`](docs/08_TESTING.md)
- Deployment and operations: [`docs/09_DEPLOYMENT_AND_OPERATIONS.md`](docs/09_DEPLOYMENT_AND_OPERATIONS.md)
- Codex implementation brief: [`docs/10_CODEX_BUILD_PLAN.md`](docs/10_CODEX_BUILD_PLAN.md)
- Roadmap: [`ROADMAP.md`](ROADMAP.md)

## Recommended repository structure

```text
shipcheck/
├── apps/
│   ├── api/
│   ├── worker/
│   └── landing/
├── packages/
│   ├── domain/
│   ├── requirement-compiler/
│   ├── execution-planner/
│   ├── playwright-adapter/
│   ├── acceptance-policy/
│   ├── evidence-store/
│   └── okx-a2mcp/
├── config/
├── schemas/
├── docs/
├── prompts/
├── examples/
├── ROADMAP.md
└── README.md
```

## Source references

The integration notes are based on official OKX.AI A2MCP, ASP registration, and OKX Payment SDK documentation as accessed on 2026-07-11, plus official Playwright documentation. Verify package versions before installation.
