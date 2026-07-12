# Requirement Compiler Specification

## Purpose

The compiler converts human intent into a typed acceptance contract. This is ShipCheck's primary AI capability.

The compiler does not decide whether a delivery passes. It defines what can be checked.

## Input

```json
{
  "brief": "Build a responsive launch page with pricing, FAQ, documentation and a working waitlist form.",
  "deliveryUrl": "https://example.com",
  "maxRequirements": 12
}
```

## Output

```json
{
  "schemaVersion": "shipcheck-acceptance-contract-v1.0.0",
  "compilerVersion": "shipcheck-compiler-v1",
  "requirements": [
    {
      "id": "req_pricing",
      "statement": "A pricing section is present.",
      "provenance": {
        "kind": "BRIEF_SPAN",
        "sourceText": "pricing",
        "start": 36,
        "end": 43
      },
      "class": "EXECUTABLE",
      "priority": "REQUIRED",
      "prioritySource": "DEFAULT",
      "observable": {
        "kind": "CONTENT_SECTION",
        "terms": ["pricing", "plans"]
      },
      "adapter": "PUBLIC_WEB",
      "confidence": 0.94
    }
  ]
}
```

## Invariants

1. Every requirement has exactly one provenance variant: a zero-based `[start, end)` `BRIEF_SPAN` whose `sourceText` exactly matches the brief slice, or a `DERIVED_BASELINE` rationale.
2. Compound statements split into atomic requirements.
3. No feature may be invented.
4. Subjective adjectives are not executable without measurable rules or a reference.
5. Ambiguous pronouns, dates, targets, and outcomes remain ambiguous.
6. The compiler cannot emit code, selectors, shell commands, or unrestricted URLs.
7. Confidence does not affect acceptance directly.
8. A requirement without a supported safe adapter cannot be executable.
9. Derived baselines are always `OPTIONAL` with `prioritySource: DEFAULT`.

## Classes

### EXECUTABLE

The expected state can be safely observed.

Examples:

- pricing exists;
- documentation link resolves;
- waitlist accepts a valid email;
- no horizontal overflow at 375 px.

### AMBIGUOUS

Potentially objective but underspecified.

Examples:

- “Link it to the app.”
- “Use the correct price.”
- “The form should work” with no observable success semantics.

### SUBJECTIVE

No objective condition.

Examples:

- modern;
- beautiful;
- premium;
- intuitive;
- exciting.

### UNSUPPORTED

Objective but outside V1 capability.

Examples:

- email arrives;
- wallet payment settles;
- administrator logs in;
- database backup completes.

## Requirement DSL

```typescript
type CheckIntent =
  | "CONTENT_PRESENT"
  | "SECTION_PRESENT"
  | "LINK_RESOLVES"
  | "CTA_NAVIGATES"
  | "FORM_ACCEPTS_INPUT"
  | "NAVIGATION_WORKS"
  | "NO_HORIZONTAL_OVERFLOW"
  | "ASSETS_LOAD"
  | "NO_SEVERE_CONSOLE_ERRORS"
  | "NO_FAILED_SAME_ORIGIN_REQUESTS"
  | "HTTPS_ENABLED"
  | "METADATA_PRESENT"
  | "BASIC_ACCESSIBILITY";
```

The model selects and parameterizes an intent. It does not provide executable code.

## Priority rules

Priority is explicit when the brief uses:

- must;
- required;
- critical;
- mandatory;
- optional;
- nice to have.

Otherwise:

- functional requirements default to `REQUIRED`;
- derived baselines default to `OPTIONAL`;
- inferred priority is labeled.

## Stages

```text
brief
→ sentence segmentation
→ candidate obligations
→ atomic decomposition
→ deduplication
→ class assignment
→ priority assignment
→ observable mapping
→ schema validation
→ acceptance contract
```

## Ambiguity output

```json
{
  "statement": "The website should look modern.",
  "class": "SUBJECTIVE",
  "clarification": "Provide a reference design or measurable visual constraints."
}
```

## Failure handling

Compiler output must validate against `schemas/acceptance-contract.schema.json`.

The compiler may propose no more than 12 total requirements. Quick execution later selects no more than 8 executable requirements; non-executable requirements remain visible in the contract and receipt.

- First invalid output: one constrained repair retry.
- Second invalid output: stop without browser execution.
- No valid executable requirement: return `INSUFFICIENT_SPECIFICATION`.
