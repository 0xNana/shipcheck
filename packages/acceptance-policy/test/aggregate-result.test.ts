import {
  CheckDefinitionSchema,
  ObservationSchema,
  RequirementSchema,
} from "@shipcheck/domain";
import { describe, expect, it } from "vitest";

import { aggregateRequirementResult } from "../src/index.js";

const executableRequirement = RequirementSchema.parse({
  id: "req_pricing",
  statement: "A pricing section is present.",
  provenance: {
    kind: "BRIEF_SPAN",
    sourceText: "pricing",
    start: 10,
    end: 17,
  },
  class: "EXECUTABLE",
  adapter: "PUBLIC_WEB",
  priority: "REQUIRED",
  prioritySource: "DEFAULT",
  confidence: 0.95,
  intent: "SECTION_PRESENT",
});

const checkA = CheckDefinitionSchema.parse({
  checkId: "check_a",
  requirementId: "req_pricing",
  adapter: "PUBLIC_WEB",
  intent: "SECTION_PRESENT",
  parameters: {},
});

const checkB = CheckDefinitionSchema.parse({
  checkId: "check_b",
  requirementId: "req_pricing",
  adapter: "PUBLIC_WEB",
  intent: "SECTION_PRESENT",
  parameters: {},
});

function observation(
  checkId: "check_a" | "check_b",
  status:
    | "OBSERVED_TRUE"
    | "OBSERVED_FALSE"
    | "INCONCLUSIVE"
    | "EXECUTION_ERROR",
  observationId: string,
  evidenceIds: string[] = [],
) {
  return ObservationSchema.parse({
    observationId,
    checkId,
    status,
    observedAt: "2026-07-12T10:00:00Z",
    summary: `${checkId} was ${status.toLowerCase()}`,
    facts: {},
    evidenceIds,
  });
}

describe("aggregateRequirementResult", () => {
  it("maps subjective requirements without pretending to execute them", () => {
    const requirement = RequirementSchema.parse({
      id: "req_modern",
      statement: "The design feels modern.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "modern",
        start: 20,
        end: 26,
      },
      class: "SUBJECTIVE",
      priority: "REQUIRED",
      prioritySource: "DEFAULT",
      confidence: 0.99,
      clarification: "Provide measurable visual constraints.",
    });

    const result = aggregateRequirementResult(requirement, [], []);

    expect(result.status).toBe("NOT_OBJECTIVELY_TESTABLE");
    expect(result.rerunEligible).toBe(false);
    expect(result.observationIds).toEqual([]);
  });

  it.each(["AMBIGUOUS", "UNSUPPORTED"] as const)(
    "maps %s requirements to unsupported",
    (requirementClass) => {
      const requirement = RequirementSchema.parse({
        id: `req_${requirementClass.toLowerCase()}`,
        statement: "The requirement cannot be executed safely.",
        provenance: {
          kind: "BRIEF_SPAN",
          sourceText: "cannot",
          start: 0,
          end: 6,
        },
        class: requirementClass,
        priority: "REQUIRED",
        prioritySource: "DEFAULT",
        confidence: 0.9,
      });

      expect(aggregateRequirementResult(requirement, [], []).status).toBe(
        "UNSUPPORTED",
      );
    },
  );

  it("marks an executable requirement unsupported when no safe check exists", () => {
    const result = aggregateRequirementResult(executableRequirement, [], []);

    expect(result.status).toBe("UNSUPPORTED");
    expect(result.rerunEligible).toBe(false);
  });

  it("lets contradictory evidence fail before an execution error", () => {
    const result = aggregateRequirementResult(
      executableRequirement,
      [checkB, checkA],
      [
        observation("check_b", "EXECUTION_ERROR", "obs_b"),
        observation("check_a", "OBSERVED_FALSE", "obs_a", ["ev_failure"]),
      ],
    );

    expect(result.status).toBe("FAIL");
    expect(result.checkIds).toEqual(["check_a", "check_b"]);
    expect(result.evidenceIds).toEqual(["ev_failure"]);
    expect(result.rerunEligible).toBe(true);
  });

  it("marks missing observations unverified", () => {
    const result = aggregateRequirementResult(
      executableRequirement,
      [checkA, checkB],
      [observation("check_a", "OBSERVED_TRUE", "obs_a")],
    );

    expect(result.status).toBe("UNVERIFIED");
    expect(result.rerunEligible).toBe(true);
  });

  it("marks duplicate observations for one check unverified", () => {
    const result = aggregateRequirementResult(
      executableRequirement,
      [checkA],
      [
        observation("check_a", "OBSERVED_TRUE", "obs_a"),
        observation("check_a", "OBSERVED_TRUE", "obs_b"),
      ],
    );

    expect(result.status).toBe("UNVERIFIED");
  });

  it("passes only when every planned check is observed true", () => {
    const result = aggregateRequirementResult(
      executableRequirement,
      [checkB, checkA],
      [
        observation("check_b", "OBSERVED_TRUE", "obs_b", ["ev_b", "ev_shared"]),
        observation("check_a", "OBSERVED_TRUE", "obs_a", ["ev_shared", "ev_a"]),
      ],
    );

    expect(result.status).toBe("PASS");
    expect(result.checkIds).toEqual(["check_a", "check_b"]);
    expect(result.observationIds).toEqual(["obs_a", "obs_b"]);
    expect(result.evidenceIds).toEqual(["ev_a", "ev_b", "ev_shared"]);
    expect(result.rerunEligible).toBe(false);
  });
});
