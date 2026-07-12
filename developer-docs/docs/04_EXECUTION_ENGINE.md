# Public-Web Execution Engine

## Purpose

The engine witnesses whether objective requirements are satisfied. Playwright is an execution adapter, not the product's reasoning layer.

## V1 model

- Chromium only
- isolated non-persistent context per run
- desktop and one mobile viewport
- JavaScript enabled
- bounded navigation and action budgets
- no authentication
- no destructive actions
- no arbitrary model-generated code

## Planner output

```json
{
  "checkId": "check_waitlist",
  "requirementId": "req_waitlist",
  "adapter": "PUBLIC_WEB",
  "intent": "FORM_ACCEPTS_INPUT",
  "parameters": {
    "semanticTarget": "waitlist form",
    "inputProfile": "SAFE_TEST_EMAIL",
    "successSignals": [
      "VISIBLE_CONFIRMATION",
      "SUCCESSFUL_SAME_ORIGIN_RESPONSE"
    ]
  }
}
```

The planner owns a strict, intent-discriminated parameter schema. Compiler or
model output never supplies selectors, scripts, request URLs, or browser code.
Check IDs are derived deterministically from the contract hash, requirement ID,
and allowed intent. A contract whose executable count exceeds the quick-mode
limit is rejected rather than partially executed.

## Supported checks

### Content and sections

Use semantic text, headings, landmarks, roles, and DOM structure. Hidden text alone cannot satisfy a requirement.

### Links and CTAs

For same-origin links:

- navigate or safely request;
- record final URL and status;
- detect redirect loops.

For third-party destinations:

- verify href and optionally safe availability;
- do not claim the third-party application works.

### Basic forms

Allowed:

- newsletter;
- waitlist;
- contact forms using synthetic data.

Blocked:

- payments;
- account deletion;
- order placement;
- password reset;
- wallet signing;
- file upload;
- government or legal submissions.

A form passes only with an observable success signal or successful same-origin response. No observable success state yields `UNVERIFIED`.

### Responsive behavior

Viewports:

- 1440 × 900;
- 375 × 812.

Check:

- document width remains within tolerance;
- primary navigation is reachable;
- required content remains present;
- critical controls are not completely outside viewport.

### Console and network

Capture:

- uncaught page errors;
- severe console errors;
- failed same-origin requests;
- relevant 4xx/5xx responses.

Do not fail for irrelevant analytics or blocked trackers unless the requirement depends on them.

### Assets

Detect required images that fail to load or have zero natural dimensions.

### Metadata

Check title and description only where required or where a baseline optional check is enabled.

## Evidence

Every failure should include:

- full-page or element screenshot;
- normalized observation;
- relevant response/console record;
- trace where configured.

Pass evidence may be minimized to control cost.

## Observation model

```typescript
interface Observation {
  checkId: string;
  status:
    | "OBSERVED_TRUE"
    | "OBSERVED_FALSE"
    | "INCONCLUSIVE"
    | "EXECUTION_ERROR";
  observedAt: string;
  summary: string;
  facts: Record<string, string | number | boolean | null>;
  evidenceIds: string[];
}
```

## URL and browser safety

Before navigation and after every redirect:

1. normalize hostname;
2. resolve DNS;
3. reject blocked IP ranges;
4. enforce protocol and port;
5. enforce redirect limit;
6. abort downloads;
7. dismiss permission prompts;
8. block popup storms;
9. enforce time/resource budgets.

## Semantics

- A requirement fails only when the expected observable is contradicted.
- Browser crashes yield `UNVERIFIED` or `EXECUTION_INCOMPLETE`.
- Lack of evidence never yields `PASS`.
