# Evidence and Acceptance Receipts

## Principle

ShipCheck independently creates the observations used in the verdict.

## Artifact types

```typescript
type EvidenceType =
  | "SCREENSHOT"
  | "ELEMENT_SCREENSHOT"
  | "TRACE"
  | "DOM_EXCERPT"
  | "ACCESSIBILITY_SNAPSHOT"
  | "HTTP_RECORD"
  | "NETWORK_RECORD"
  | "CONSOLE_RECORD"
  | "TARGET_FINGERPRINT";
```

## Manifest entry

```json
{
  "id": "ev_01...",
  "type": "SCREENSHOT",
  "sha256": "hex...",
  "contentType": "image/png",
  "sizeBytes": 182341,
  "storageUrl": "signed-expiring-url",
  "createdAt": "2026-07-11T20:00:00Z",
  "redaction": {
    "applied": false
  }
}
```

## Traceability

```text
Requirement
    ↓
Check definition
    ↓
Observation
    ↓
Evidence artifacts
    ↓
Requirement result
```

A result is invalid if it cannot reference the observation used to derive it.

## Acceptance policy

Canonical policy: `config/acceptance-policy.v1.json`.

Summary:

Apply the first matching rule in this order:

1. systemic execution failure → `EXECUTION_INCOMPLETE`;
2. no executable requirements → `INSUFFICIENT_SPECIFICATION`;
3. any `CRITICAL` or `REQUIRED` failure → `CHANGES_REQUIRED`;
4. any `CRITICAL` unverified result → `EXECUTION_INCOMPLETE`;
5. any `REQUIRED` unverified result → `ACCEPTED_WITH_NOTES`;
6. any remaining non-pass result, including subjective, unsupported, or optional failure → `ACCEPTED_WITH_NOTES`;
7. otherwise → `ACCEPTED`.

Subjective and unsupported requirements remain visible and can never pass. Required or critical instances prevent unconditional acceptance.

## Requirement-result aggregation

Non-executable requirements map directly: `SUBJECTIVE` to `NOT_OBJECTIVELY_TESTABLE`, and `AMBIGUOUS` or `UNSUPPORTED` to `UNSUPPORTED`. For an executable requirement:

1. no safe planned check → `UNSUPPORTED`;
2. any `OBSERVED_FALSE` check → `FAIL`;
3. otherwise, any missing observation, `INCONCLUSIVE`, or `EXECUTION_ERROR` → `UNVERIFIED`;
4. all planned checks `OBSERVED_TRUE` → `PASS`.

Every planned check must contribute exactly one normalized observation. A pass therefore always references one or more observations. Check arrays are evaluated in stable `checkId` order.

## Receipt

Contains:

- receipt ID;
- receipt and contract schema versions;
- specification hash;
- target;
- target fingerprint;
- compiler, policy, execution-policy, and adapter versions;
- counts;
- results;
- overall verdict;
- evidence manifest hash;
- timestamps;
- optional signature;
- optional X Layer anchor transaction.

## Canonical hashing

Use deterministic JSON canonicalization before SHA-256.

```text
specificationHash = SHA256(canonical acceptance contract with contractHash omitted)
evidenceManifestHash = SHA256(canonical artifact hashes and immutable metadata)
receiptHash = SHA256(canonical receipt with receiptHash, signature, and anchor omitted)
```

Do not hash expiring signed URLs. Hash bytes and immutable metadata.

Canonical JSON recursively sorts object keys, preserves array order, rejects non-JSON values and non-finite numbers, and emits UTF-8 without insignificant whitespace. Evidence-manifest entries are sorted by evidence ID before hashing. Hash fields use lowercase hexadecimal SHA-256.

## Optional X Layer anchoring

Anchor only:

- receipt hash;
- specification hash;
- evidence manifest hash;
- verdict code;
- timestamp;
- verifier identifier.

Do not publish:

- brief;
- screenshots;
- trace contents;
- private URLs;
- customer identifiers;
- form data.

## Limitation statement

An accepted receipt means:

> Under the referenced specification, adapter capabilities, evidence, and policy version, no critical or required acceptance failure was observed.

It does not mean:

- bug-free;
- secure;
- legally compliant;
- performant at scale;
- aesthetically good.
