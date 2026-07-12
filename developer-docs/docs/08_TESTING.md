# Test Strategy

## Layers

### Domain unit tests

Test:

- requirement normalization;
- duplicate merging;
- priority resolution;
- observation-to-result mapping;
- acceptance verdict;
- receipt canonicalization and hashes.

### Compiler contract tests

Use fixed briefs and assert structure rather than exact prose:

- expected atomic requirements exist;
- subjective items are classified;
- no feature is invented;
- only allowlisted intents appear;
- source spans are present;
- schema passes.

### Adapter tests

Controlled fixture websites:

1. complete landing page;
2. missing pricing;
3. documentation 404;
4. waitlist returns 500;
5. waitlist has no observable confirmation;
6. mobile overflow;
7. broken image;
8. console exception;
9. redirect to blocked network;
10. destructive-looking form;
11. popup storm;
12. slow/infinite page.

### End-to-end

```text
brief
→ contract
→ plan
→ fixture execution
→ evidence
→ verdict
→ receipt
```

### Payment integration

- unpaid returns 402;
- valid testnet payment accepted;
- paid request replay returns result;
- payment replay cannot purchase another request;
- invalid amount/recipient/network rejected;
- business logic does not run before payment.

## Canonical scenarios

### Accepted

All critical and required executable requirements pass and no other non-pass result exists.

Expected: `ACCEPTED`.

### Accepted with notes

All executable requirements pass; a subjective requirement exists.

Expected: `ACCEPTED_WITH_NOTES`.

### Critical failure

Waitlist returns 500.

Expected: `CHANGES_REQUIRED`.

### Infrastructure failure

Worker crashes before observations.

Expected: `EXECUTION_INCOMPLETE`.

### Vague brief

“Make me a cool modern website.”

Expected: `INSUFFICIENT_SPECIFICATION`.

### Unsupported auth

“Users can log in and view a private dashboard.”

Requirement status: `UNSUPPORTED`.

## Property tests

- Critical failure always prevents acceptance.
- Adding a required failure cannot improve verdict.
- Removing evidence cannot convert `UNVERIFIED` to `PASS`.
- Changing receipt body changes receipt hash.
- Same contract and observations produce same verdict.
- Execution error never becomes `FAIL` without contrary observation.
- The first matching acceptance-policy precedence rule always wins.
- A required subjective or unsupported requirement cannot yield `ACCEPTED`.

## Safety tests

- localhost;
- private IP;
- redirect to metadata service;
- DNS rebinding;
- `file://`, `ftp://`, `javascript:`;
- popup/download attempts;
- permission prompts;
- prompt-injection page text;
- card-details form;
- delete/publish form.

## Demo acceptance

The demo site must produce:

- at least one pass;
- two functional failures;
- one responsive failure;
- one subjective item;
- screenshots and trace;
- final `CHANGES_REQUIRED`.
