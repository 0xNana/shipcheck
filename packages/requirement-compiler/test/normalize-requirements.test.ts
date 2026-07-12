import { RequirementSchema, type Requirement } from "@shipcheck/domain";
import { describe, expect, it } from "vitest";

import { normalizeAndDeduplicateRequirements } from "../src/index.js";

function executable(
  overrides: Partial<{
    id: string;
    statement: string;
    intent: "SECTION_PRESENT" | "CONTENT_PRESENT";
    priority: "CRITICAL" | "REQUIRED" | "OPTIONAL";
    prioritySource: "EXPLICIT" | "INFERRED" | "DEFAULT";
    confidence: number;
    provenance:
      | {
          kind: "BRIEF_SPAN";
          sourceText: string;
          start: number;
          end: number;
        }
      | {
          kind: "DERIVED_BASELINE";
          rationale: string;
        };
  }> = {},
): Requirement {
  return RequirementSchema.parse({
    id: overrides.id ?? "req_pricing",
    statement: overrides.statement ?? "A pricing section is present.",
    provenance: overrides.provenance ?? {
      kind: "BRIEF_SPAN",
      sourceText: "pricing",
      start: 25,
      end: 32,
    },
    class: "EXECUTABLE",
    adapter: "PUBLIC_WEB",
    priority: overrides.priority ?? "REQUIRED",
    prioritySource: overrides.prioritySource ?? "DEFAULT",
    confidence: overrides.confidence ?? 0.9,
    intent: overrides.intent ?? "SECTION_PRESENT",
  });
}

describe("normalizeAndDeduplicateRequirements", () => {
  it("merges equivalent statements independent of case, whitespace, and terminal punctuation", () => {
    const derived = executable({
      id: "req_a",
      statement: "  A   PRICING section is present! ",
      priority: "OPTIONAL",
      prioritySource: "DEFAULT",
      confidence: 0.8,
      provenance: {
        kind: "DERIVED_BASELINE",
        rationale: "Baseline pricing presence.",
      },
    });
    const explicit = executable({
      id: "req_z",
      statement: "A pricing section is present.",
      priority: "CRITICAL",
      prioritySource: "EXPLICIT",
      confidence: 0.99,
    });

    const normalized = normalizeAndDeduplicateRequirements([
      derived,
      explicit,
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      id: "req_a",
      statement: "A pricing section is present.",
      priority: "CRITICAL",
      prioritySource: "EXPLICIT",
      confidence: 0.99,
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "pricing",
        start: 25,
        end: 32,
      },
    });
  });

  it("does not merge equal statements assigned to different executable intents", () => {
    const section = executable({
      id: "req_section",
      intent: "SECTION_PRESENT",
    });
    const content = executable({
      id: "req_content",
      intent: "CONTENT_PRESENT",
    });

    expect(
      normalizeAndDeduplicateRequirements([section, content]),
    ).toHaveLength(2);
  });

  it("does not merge requirements from different classes", () => {
    const objective = executable({ id: "req_objective" });
    const subjective = RequirementSchema.parse({
      id: "req_subjective",
      statement: "A pricing section is present.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "pricing",
        start: 25,
        end: 32,
      },
      class: "SUBJECTIVE",
      priority: "REQUIRED",
      prioritySource: "DEFAULT",
      confidence: 0.9,
    });

    expect(
      normalizeAndDeduplicateRequirements([objective, subjective]),
    ).toHaveLength(2);
  });

  it("preserves exact source text while normalizing statement whitespace", () => {
    const requirement = executable({
      statement: "A\tpricing\nsection   is present.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "Pricing\nSection",
        start: 4,
        end: 19,
      },
    });

    const [normalized] = normalizeAndDeduplicateRequirements([requirement]);

    expect(normalized?.statement).toBe("A pricing section is present.");
    expect(normalized?.provenance).toMatchObject({
      sourceText: "Pricing\nSection",
    });
  });

  it("produces byte-equivalent output regardless of candidate order", () => {
    const first = executable({
      id: "req_b",
      statement: "Documentation is linked.",
      intent: "CONTENT_PRESENT",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "documentation",
        start: 40,
        end: 53,
      },
    });
    const second = executable({
      id: "req_a",
      statement: "A pricing section is present.",
    });

    expect(normalizeAndDeduplicateRequirements([first, second])).toEqual(
      normalizeAndDeduplicateRequirements([second, first]),
    );
  });
});
