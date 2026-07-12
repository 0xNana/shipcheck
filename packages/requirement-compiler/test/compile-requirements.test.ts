import { hashAcceptanceContract } from "@shipcheck/domain";
import { describe, expect, it } from "vitest";

import {
  buildCompilerPrompt,
  compileRequirements,
  RequirementCompilationError,
  type CompilerModelRequest,
  type RequirementCompilerModel,
} from "../src/index.js";

const brief = "Build a launch page with pricing.";

class FixtureModel implements RequirementCompilerModel {
  readonly requests: CompilerModelRequest[] = [];

  constructor(private readonly outputs: readonly unknown[]) {}

  generate(request: CompilerModelRequest): Promise<unknown> {
    this.requests.push(request);
    return Promise.resolve(this.outputs[this.requests.length - 1]);
  }
}

describe("buildCompilerPrompt", () => {
  it("bounds the model to requirement compilation without verdicts or code", () => {
    const prompt = buildCompilerPrompt([
      "CONTENT_PRESENT",
      "SECTION_PRESENT",
    ]);

    expect(prompt).toContain("JSON only");
    expect(prompt).toContain("Never output a final acceptance verdict");
    expect(prompt).toContain("SECTION_PRESENT");
    expect(prompt).toContain("Do not write");
  });
});

describe("compileRequirements", () => {
  it("assembles and hashes a validated contract from model candidates", async () => {
    const validOutput = {
      requirements: [
        {
          id: "req_pricing",
          statement: "A pricing section is present.",
          provenance: {
            kind: "BRIEF_SPAN",
            sourceText: "pricing",
            start: 25,
            end: 32,
          },
          class: "EXECUTABLE",
          adapter: "PUBLIC_WEB",
          priority: "REQUIRED",
          prioritySource: "DEFAULT",
          confidence: 0.98,
          intent: "SECTION_PRESENT",
        },
      ],
    };
    const model = new FixtureModel([validOutput]);

    const contract = await compileRequirements(
      {
        brief,
        deliveryUrl: "https://example.com",
        maxRequirements: 12,
      },
      {
        model,
        compilerVersion: "compiler-v1",
        policyVersion: "policy-v1",
        executionPolicyVersion: "execution-v1",
        createContractId: () => "contract_001",
        now: () => "2026-07-12T10:00:00Z",
      },
    );

    expect(contract.contractId).toBe("contract_001");
    expect(contract.target).toBe("https://example.com/");
    expect(contract.requirements).toHaveLength(1);
    expect(contract.contractHash).toBe(hashAcceptanceContract(contract));
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]?.brief).toBe(brief);
    expect(model.requests[0]?.isRepair).toBe(false);
    expect(model.requests[0]?.responseSchema).toMatchObject({
      type: "object",
      properties: {
        requirements: { type: "array" },
      },
    });
  });

  it("makes exactly one constrained repair request after invalid output", async () => {
    const invalidOutput = {
      requirements: [
        {
          id: "req_pricing",
          statement: "A pricing section is present.",
          provenance: {
            kind: "BRIEF_SPAN",
            sourceText: "pricing",
            start: 25,
            end: 32,
          },
          class: "EXECUTABLE",
          adapter: "PUBLIC_WEB",
          priority: "REQUIRED",
          prioritySource: "DEFAULT",
          confidence: 0.98,
        },
      ],
    };
    const validOutput = {
      requirements: [
        {
          ...invalidOutput.requirements[0],
          intent: "SECTION_PRESENT",
        },
      ],
    };
    const model = new FixtureModel([invalidOutput, validOutput]);

    const compiled = await compileRequirements(
      { brief, deliveryUrl: "https://example.com" },
      {
        model,
        compilerVersion: "compiler-v1",
        policyVersion: "policy-v1",
        executionPolicyVersion: "execution-v1",
        createContractId: () => "contract_repaired",
        now: () => "2026-07-12T10:00:00Z",
      },
    );

    const repairedRequirement = compiled.requirements[0];
    expect(repairedRequirement?.class).toBe("EXECUTABLE");
    if (repairedRequirement?.class !== "EXECUTABLE") {
      throw new TypeError("Expected an executable repaired requirement");
    }
    expect(repairedRequirement.intent).toBe("SECTION_PRESENT");
    expect(model.requests).toHaveLength(2);
    expect(model.requests[1]?.isRepair).toBe(true);
    expect(model.requests[1]?.issues?.length ?? 0).toBeGreaterThan(0);
  });

  it("repairs source provenance that does not exactly match the brief", async () => {
    const invalidProvenance = {
      requirements: [
        {
          id: "req_pricing",
          statement: "A pricing section is present.",
          provenance: {
            kind: "BRIEF_SPAN",
            sourceText: "price",
            start: 25,
            end: 32,
          },
          class: "EXECUTABLE",
          adapter: "PUBLIC_WEB",
          priority: "REQUIRED",
          prioritySource: "DEFAULT",
          confidence: 0.98,
          intent: "SECTION_PRESENT",
        },
      ],
    };
    const repaired = {
      requirements: [
        {
          ...invalidProvenance.requirements[0],
          provenance: {
            kind: "BRIEF_SPAN",
            sourceText: "pricing",
            start: 25,
            end: 32,
          },
        },
      ],
    };
    const model = new FixtureModel([invalidProvenance, repaired]);

    const compiled = await compileRequirements(
      { brief, deliveryUrl: "https://example.com" },
      {
        model,
        compilerVersion: "compiler-v1",
        policyVersion: "policy-v1",
        executionPolicyVersion: "execution-v1",
        createContractId: () => "contract_provenance",
        now: () => "2026-07-12T10:00:00Z",
      },
    );

    expect(compiled.requirements[0]?.provenance).toEqual(
      repaired.requirements[0]?.provenance,
    );
    expect(model.requests).toHaveLength(2);
  });

  it("repairs duplicate candidate IDs before allocating a contract", async () => {
    const requirement = {
      id: "req_pricing",
      statement: "A pricing section is present.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "pricing",
        start: 25,
        end: 32,
      },
      class: "EXECUTABLE",
      adapter: "PUBLIC_WEB",
      priority: "REQUIRED",
      prioritySource: "DEFAULT",
      confidence: 0.98,
      intent: "SECTION_PRESENT",
    };
    const model = new FixtureModel([
      { requirements: [requirement, requirement] },
      { requirements: [requirement] },
    ]);

    const compiled = await compileRequirements(
      { brief, deliveryUrl: "https://example.com" },
      {
        model,
        compilerVersion: "compiler-v1",
        policyVersion: "policy-v1",
        executionPolicyVersion: "execution-v1",
        createContractId: () => "contract_unique",
        now: () => "2026-07-12T10:00:00Z",
      },
    );

    expect(compiled.requirements).toHaveLength(1);
    expect(model.requests).toHaveLength(2);
    expect(model.requests[1]?.issues?.join(" ")).toMatch(/unique/i);
  });

  it("applies maxRequirements after semantic duplicates are merged", async () => {
    const model = new FixtureModel([
      {
        requirements: [
          {
            id: "req_z",
            statement: "A pricing section is present.",
            provenance: {
              kind: "BRIEF_SPAN",
              sourceText: "pricing",
              start: 25,
              end: 32,
            },
            class: "EXECUTABLE",
            adapter: "PUBLIC_WEB",
            priority: "REQUIRED",
            prioritySource: "DEFAULT",
            confidence: 0.9,
            intent: "SECTION_PRESENT",
          },
          {
            id: "req_a",
            statement: "a  PRICING section is present!",
            provenance: {
              kind: "BRIEF_SPAN",
              sourceText: "pricing",
              start: 25,
              end: 32,
            },
            class: "EXECUTABLE",
            adapter: "PUBLIC_WEB",
            priority: "REQUIRED",
            prioritySource: "DEFAULT",
            confidence: 0.95,
            intent: "SECTION_PRESENT",
          },
        ],
      },
    ]);

    const compiled = await compileRequirements(
      { brief, deliveryUrl: "https://example.com", maxRequirements: 1 },
      {
        model,
        compilerVersion: "compiler-v1",
        policyVersion: "policy-v1",
        executionPolicyVersion: "execution-v1",
        createContractId: () => "contract_deduplicated",
        now: () => "2026-07-12T10:00:00Z",
      },
    );

    expect(compiled.requirements).toHaveLength(1);
    expect(compiled.requirements[0]?.id).toBe("req_a");
    expect(model.requests).toHaveLength(1);
  });

  it("produces the same contract hash for reordered model candidates", async () => {
    const pricing = {
      id: "req_pricing",
      statement: "A pricing section is present.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "pricing",
        start: 25,
        end: 32,
      },
      class: "EXECUTABLE",
      adapter: "PUBLIC_WEB",
      priority: "REQUIRED",
      prioritySource: "DEFAULT",
      confidence: 0.9,
      intent: "SECTION_PRESENT",
    };
    const launchPage = {
      id: "req_launch",
      statement: "A launch page is present.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "launch page",
        start: 8,
        end: 19,
      },
      class: "EXECUTABLE",
      adapter: "PUBLIC_WEB",
      priority: "REQUIRED",
      prioritySource: "DEFAULT",
      confidence: 0.9,
      intent: "CONTENT_PRESENT",
    };
    const options = {
      compilerVersion: "compiler-v1",
      policyVersion: "policy-v1",
      executionPolicyVersion: "execution-v1",
      createContractId: () => "contract_stable",
      now: () => "2026-07-12T10:00:00Z",
    };

    const first = await compileRequirements(
      { brief, deliveryUrl: "https://example.com" },
      {
        ...options,
        model: new FixtureModel([
          { requirements: [pricing, launchPage] },
        ]),
      },
    );
    const second = await compileRequirements(
      { brief, deliveryUrl: "https://example.com" },
      {
        ...options,
        model: new FixtureModel([
          { requirements: [launchPage, pricing] },
        ]),
      },
    );

    expect(first.requirements).toEqual(second.requirements);
    expect(first.contractHash).toBe(second.contractHash);
  });

  it("stops after the second invalid response without creating a contract", async () => {
    const invalidOutput = {
      verdict: "ACCEPTED",
      requirements: [],
    };
    const model = new FixtureModel([invalidOutput, invalidOutput]);
    let contractIdCalls = 0;

    const compilation = compileRequirements(
      { brief, deliveryUrl: "https://example.com" },
      {
        model,
        compilerVersion: "compiler-v1",
        policyVersion: "policy-v1",
        executionPolicyVersion: "execution-v1",
        createContractId: () => {
          contractIdCalls += 1;
          return "must_not_be_created";
        },
        now: () => "2026-07-12T10:00:00Z",
      },
    );

    await expect(compilation).rejects.toBeInstanceOf(
      RequirementCompilationError,
    );
    expect(model.requests).toHaveLength(2);
    expect(contractIdCalls).toBe(0);
  });
});
