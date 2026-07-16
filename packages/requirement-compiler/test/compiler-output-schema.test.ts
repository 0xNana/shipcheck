import { describe, expect, it } from "vitest";

import {
  compilerOutputResponseSchema,
  CompilerOutputCandidateSchema,
} from "../src/compiler-output-schema.js";

describe("compilerOutputResponseSchema", () => {
  it("produces a flat JSON schema without oneOf for OpenAI strict mode", () => {
    const schema = compilerOutputResponseSchema();
    const serialized = JSON.stringify(schema);
    expect(serialized).not.toContain("oneOf");
    expect(serialized).not.toContain("anyOf");
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        requirements: expect.objectContaining({ type: "array" }),
      },
    });
  });

  it("accepts valid executable requirements for downstream RequirementSchema parse", () => {
    const parsed = CompilerOutputCandidateSchema.parse({
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
    });
    expect(parsed.requirements).toHaveLength(1);
  });
});
