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
      "adapter": "PUBLIC_WEB",
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

## Model boundary

The model returns only a strict candidate envelope:

```json
{
  "requirements": []
}
```

The adapter supplies the generated JSON Schema for this envelope to providers that support structured output. The model does not provide the target, contract ID, schema/compiler/policy versions, creation time, contract hash, or verdict. ShipCheck validates candidate structure and exact source provenance, performs at most one constrained repair request containing validation issues, and then deterministically assembles and hashes the acceptance contract.

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
10. Executable requirements use the `PUBLIC_WEB` adapter in V1; non-executable requirements have no adapter or intent.

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

## Deterministic normalization and deduplication

Before enforcing the caller's `maxRequirements` and hashing the contract, ShipCheck:

1. applies Unicode NFKC normalization and collapses whitespace in normalized statements and clarifications;
2. preserves `BRIEF_SPAN.sourceText` and offsets exactly;
3. groups candidates only when normalized statement, requirement class, and executable intent all match;
4. never merges requirements with different classes or executable intents;
5. selects the lexicographically smallest ID, strongest priority (`CRITICAL > REQUIRED > OPTIONAL`), strongest matching priority source (`EXPLICIT > INFERRED > DEFAULT`), and highest confidence;
6. prefers the earliest exact brief span over a derived baseline for merged provenance;
7. sorts final requirements by a locale-independent semantic key.

These rules intentionally cover conservative textual equivalence, not open-ended semantic similarity.

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
- Second invalid output: return `COMPILATION_FAILED` and stop without allocating a contract or starting browser execution.
- No valid executable requirement: return `INSUFFICIENT_SPECIFICATION`.
