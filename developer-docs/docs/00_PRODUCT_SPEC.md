# Product Specification

## Problem

Software agents increasingly receive natural-language tasks and report completion. Natural language is not directly executable, and a polished deployment can conceal missing or broken requirements.

Existing test tools execute test cases. They do not establish what the original human brief meant, which statements are testable, or whether the final result satisfies the agreement.

## Product definition

ShipCheck is an independent acceptance service that:

1. receives a natural-language brief and delivery URL;
2. extracts atomic requirements;
3. classifies each requirement;
4. converts supported objective requirements into executable checks;
5. runs those checks in an isolated browser;
6. creates original evidence;
7. applies a deterministic acceptance policy;
8. returns a human-readable report and machine-readable receipt.

## Primary user

An AI coding agent preparing to submit completed work.

## Secondary users

- orchestration agents supervising builder agents;
- humans receiving software from an agent or freelancer;
- marketplaces and escrow systems;
- CI/CD systems;
- hackathon and grant evaluators.

## Core jobs

### Builder agent

> Before I claim completion, identify which requirements still fail and return actionable evidence.

### Requester

> Show whether the delivery matches my original brief without requiring me to manually author tests.

### Marketplace

> Produce a portable record of the specification, execution evidence, and verdict.

## Product principles

1. **Independent evidence:** ShipCheck gathers its own observations.
2. **Structured uncertainty:** unsupported and non-objective requirements are explicit.
3. **Deterministic verdicting:** the LLM cannot award acceptance.
4. **Specification provenance:** every result references a versioned contract.
5. **No false assurance:** functional acceptance is not a security audit.
6. **Safe execution:** V1 actions are public, bounded, and non-destructive.
7. **Agent-readable output:** failures are concise enough to feed back into a build loop.
