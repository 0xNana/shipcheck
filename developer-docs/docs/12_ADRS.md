# Architecture Decision Records

## ADR-001 — Agent Acceptance Layer, not QA platform

**Decision:** Own requirement-to-proof acceptance, not generic test authoring.

**Reason:** Browser automation is commoditized. Converting intent into a bounded executable contract is the differentiating capability.

## ADR-002 — LLM compiles; policy decides

**Decision:** The compiler produces typed requirements. A pure policy engine produces verdicts.

**Reason:** Prevent false precision and enable deterministic replay.

## ADR-003 — Finite DSL

**Decision:** The compiler may only emit allowlisted check intents.

**Reason:** Model-generated test code creates security and reliability risks.

## ADR-004 — Public websites only in V1

**Reason:** Narrow safety scope and ship a credible implementation.

## ADR-005 — Independent evidence

**Decision:** Gather observations directly.

**Reason:** Caller-supplied evidence is not independent acceptance.

## ADR-006 — No aggregate score

**Decision:** Use categorical results and policy verdicts.

**Reason:** One critical failure can outweigh many trivial passes.

## ADR-007 — x402 paid A2MCP route

**Decision:** Quick Acceptance is a fixed-price call.

**Reason:** Standardized, machine-callable, and suitable for repeated build loops.

## ADR-008 — Offchain evidence, optional onchain hashes

**Reason:** Preserve privacy and cost efficiency while enabling tamper evidence.

## ADR-009 — Conservative non-executable verdicts

**Decision:** Required or critical subjective and unsupported requirements produce `ACCEPTED_WITH_NOTES` when executable requirements otherwise pass. A contract with no executable requirements produces `INSUFFICIENT_SPECIFICATION`.

**Reason:** Unsupported work must remain visible and must not be represented as unconditionally accepted.

## ADR-010 — Explicit hash projections

**Decision:** Contract hashes omit `contractHash`. Receipt hashes omit `receiptHash`, signatures, and anchors. Evidence hashes omit expiring signed URLs.

**Reason:** Self-referential and mutable delivery fields make deterministic verification impossible.

## ADR-011 — Explicit systemic execution status

**Decision:** The pure acceptance function receives `COMPLETED` or `SYSTEMIC_FAILURE` as an explicit normalized orchestration input.

**Reason:** A systemic worker failure cannot be inferred reliably from requirement results; an individual inconclusive check must remain distinct from failure of the run as a whole.

## ADR-012 — Deterministic compiler envelope

**Decision:** The model emits only schema-constrained requirement candidates. ShipCheck supplies target normalization, identifiers, versions, timestamps, and the contract hash.

**Reason:** Model-generated provenance metadata or hashes would weaken reproducibility and allow untrusted output to control the acceptance envelope.
