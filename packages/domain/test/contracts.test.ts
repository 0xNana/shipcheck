import { describe, expect, it } from "vitest";

import {
  AcceptanceContractSchema,
  AcceptancePolicySchema,
  VerifyRequestSchema,
  validateRequirementProvenance,
} from "../src/index.js";

const brief =
  "Build a responsive launch page with pricing. The design should feel modern.";

const validContract = {
  schemaVersion: "shipcheck-acceptance-contract-v1.0.0",
  contractId: "contract_demo_001",
  compilerVersion: "shipcheck-compiler-v1",
  policyVersion: "shipcheck-acceptance-v1.0.0",
  executionPolicyVersion: "shipcheck-public-web-v1.0.0",
  target: "https://example.com",
  requirements: [
    {
      id: "req_pricing",
      statement: "A pricing section is present.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "pricing",
        start: 36,
        end: 43,
      },
      class: "EXECUTABLE",
      adapter: "PUBLIC_WEB",
      priority: "REQUIRED",
      prioritySource: "DEFAULT",
      confidence: 0.95,
      intent: "SECTION_PRESENT",
    },
  ],
  createdAt: "2026-07-11T20:00:00Z",
  contractHash: "0".repeat(64),
} as const;

describe("VerifyRequestSchema", () => {
  it("accepts numeric maxRequirements from string form parameters", () => {
    expect(
      VerifyRequestSchema.parse({
        brief: "Build a simple public landing page with a visible headline.",
        deliveryUrl: "https://example.com",
        mode: "quick",
        maxRequirements: "4",
      }),
    ).toMatchObject({ maxRequirements: 4 });
  });
});

describe("AcceptanceContractSchema", () => {
  it("accepts a strict executable requirement contract", () => {
    expect(AcceptanceContractSchema.parse(validContract)).toEqual(validContract);
  });

  it("rejects an executable requirement without an intent", () => {
    const withoutIntent: Record<string, unknown> = {
      ...validContract.requirements[0],
    };
    delete withoutIntent.intent;
    const contract = { ...validContract, requirements: [withoutIntent] };

    expect(() => AcceptanceContractSchema.parse(contract)).toThrow();
  });

  it("rejects an executable requirement without its adapter", () => {
    const withoutAdapter: Record<string, unknown> = {
      ...validContract.requirements[0],
    };
    delete withoutAdapter.adapter;
    const contract = { ...validContract, requirements: [withoutAdapter] };

    expect(() => AcceptanceContractSchema.parse(contract)).toThrow();
  });

  it("rejects an intent on a subjective requirement", () => {
    const contract = {
      ...validContract,
      requirements: [
        {
          ...validContract.requirements[0],
          class: "SUBJECTIVE",
          clarification: "Provide measurable visual constraints.",
        },
      ],
    };

    expect(() => AcceptanceContractSchema.parse(contract)).toThrow();
  });

  it("requires derived baselines to be optional defaults", () => {
    const contract = {
      ...validContract,
      requirements: [
        {
          ...validContract.requirements[0],
          provenance: {
            kind: "DERIVED_BASELINE",
            rationale: "Check baseline metadata.",
          },
          priority: "REQUIRED",
        },
      ],
    };

    expect(() => AcceptanceContractSchema.parse(contract)).toThrow();
  });

  it("rejects unknown contract fields", () => {
    expect(() =>
      AcceptanceContractSchema.parse({ ...validContract, verdict: "ACCEPTED" }),
    ).toThrow();
  });

  it("rejects duplicate requirement IDs", () => {
    const contract = {
      ...validContract,
      requirements: [
        validContract.requirements[0],
        {
          ...validContract.requirements[0],
          statement: "A second requirement reuses the identifier.",
        },
      ],
    };

    expect(() => AcceptanceContractSchema.parse(contract)).toThrow();
  });
});

describe("validateRequirementProvenance", () => {
  it("accepts a source span that exactly matches the brief", () => {
    expect(
      validateRequirementProvenance(
        validContract.requirements[0].provenance,
        brief,
      ),
    ).toBe(true);
  });

  it("rejects mismatched source text", () => {
    expect(
      validateRequirementProvenance(
        {
          ...validContract.requirements[0].provenance,
          sourceText: "price",
        },
        brief,
      ),
    ).toBe(false);
  });
});

describe("AcceptancePolicySchema", () => {
  it("rejects duplicate conditions and requires OTHERWISE to be final", () => {
    expect(() =>
      AcceptancePolicySchema.parse({
        policyVersion: "policy-v1",
        minimumExecutableRequiredForAcceptance: 1,
        precedence: [
          { condition: "OTHERWISE", verdict: "ACCEPTED" },
          { condition: "OTHERWISE", verdict: "ACCEPTED_WITH_NOTES" },
        ],
        notes: [],
      }),
    ).toThrow();
  });
});
