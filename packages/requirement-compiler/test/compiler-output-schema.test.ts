import { RequirementSchema } from "@shipcheck/domain";
import { describe, expect, it } from "vitest";

import {
  assertOpenAiStrictJsonSchema,
  CompilerOutputCandidateSchema,
  compilerOutputResponseSchema,
  normalizeCompilerCandidateRequirement,
  parseCompilerRequirementsFromModelOutput,
} from "../src/compiler-output-schema.js";

const executableCandidate = {
  id: "req_pricing",
  statement: "A pricing section is present.",
  provenance: {
    kind: "BRIEF_SPAN" as const,
    sourceText: "pricing",
    start: 25,
    end: 32,
    rationale: "",
  },
  class: "EXECUTABLE" as const,
  adapter: "PUBLIC_WEB",
  priority: "REQUIRED" as const,
  prioritySource: "DEFAULT" as const,
  confidence: 0.98,
  intent: "SECTION_PRESENT",
  clarification: "",
};

describe("compilerOutputResponseSchema", () => {
  it("produces a flat JSON schema without oneOf for OpenAI strict mode", () => {
    const schema = compilerOutputResponseSchema();
    const serialized = JSON.stringify(schema);
    expect(serialized).not.toContain("oneOf");
    expect(serialized).not.toContain("anyOf");
  });

  it("lists every property key as required at every object level", () => {
    expect(() => assertOpenAiStrictJsonSchema(compilerOutputResponseSchema())).not.toThrow();
  });

  it("normalizes sentinels into domain requirements", () => {
    const normalized = normalizeCompilerCandidateRequirement(executableCandidate);
    expect(RequirementSchema.parse(normalized)).toMatchObject({
      id: "req_pricing",
      class: "EXECUTABLE",
      adapter: "PUBLIC_WEB",
      intent: "SECTION_PRESENT",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "pricing",
      },
    });
  });

  it("parses full model output through candidate and domain schemas", () => {
    const parsed = parseCompilerRequirementsFromModelOutput({
      requirements: [executableCandidate],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toHaveLength(1);
    }
  });

  it("accepts derived baseline provenance with zero sentinels", () => {
    const parsed = parseCompilerRequirementsFromModelOutput({
      requirements: [
        {
          ...executableCandidate,
          id: "req_https",
          statement: "The site uses HTTPS.",
          class: "EXECUTABLE",
          provenance: {
            kind: "DERIVED_BASELINE",
            sourceText: "",
            start: 0,
            end: 0,
            rationale: "Baseline security expectation for public web delivery.",
          },
          priority: "OPTIONAL",
          prioritySource: "DEFAULT",
          intent: "HTTPS_ENABLED",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects duplicate requirement ids in candidate output", () => {
    const parsed = CompilerOutputCandidateSchema.safeParse({
      requirements: [executableCandidate, executableCandidate],
    });
    expect(parsed.success).toBe(false);
  });
});
