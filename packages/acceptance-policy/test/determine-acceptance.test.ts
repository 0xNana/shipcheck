import {
  AcceptanceContractSchema,
  AcceptancePolicySchema,
  RequirementResultSchema,
  RequirementSchema,
  type Requirement,
  type RequirementResult,
} from "@shipcheck/domain";
import { describe, expect, it } from "vitest";

import { determineAcceptance } from "../src/index.js";

const policy = AcceptancePolicySchema.parse({
  policyVersion: "shipcheck-acceptance-v1.0.0",
  minimumExecutableRequiredForAcceptance: 1,
  precedence: [
    {
      condition: "SYSTEMIC_EXECUTION_FAILURE",
      verdict: "EXECUTION_INCOMPLETE",
    },
    {
      condition: "NO_EXECUTABLE_REQUIREMENTS",
      verdict: "INSUFFICIENT_SPECIFICATION",
    },
    { condition: "ANY_CRITICAL_FAIL", verdict: "CHANGES_REQUIRED" },
    { condition: "ANY_REQUIRED_FAIL", verdict: "CHANGES_REQUIRED" },
    {
      condition: "ANY_CRITICAL_UNVERIFIED",
      verdict: "EXECUTION_INCOMPLETE",
    },
    {
      condition: "ANY_REQUIRED_UNVERIFIED",
      verdict: "ACCEPTED_WITH_NOTES",
    },
    { condition: "ANY_NON_PASS_RESULT", verdict: "ACCEPTED_WITH_NOTES" },
    { condition: "OTHERWISE", verdict: "ACCEPTED" },
  ],
  notes: [],
});

function requirement(
  id: string,
  priority: "CRITICAL" | "REQUIRED" | "OPTIONAL" = "REQUIRED",
): Requirement {
  return RequirementSchema.parse({
    id,
    statement: `Requirement ${id} passes.`,
    provenance: {
      kind: "BRIEF_SPAN",
      sourceText: id,
      start: 0,
      end: id.length,
    },
    class: "EXECUTABLE",
    adapter: "PUBLIC_WEB",
    priority,
    prioritySource: "EXPLICIT",
    confidence: 1,
    intent: "CONTENT_PRESENT",
  });
}

function subjectiveRequirement(id: string): Requirement {
  return RequirementSchema.parse({
    id,
    statement: `Requirement ${id} is subjective.`,
    provenance: {
      kind: "BRIEF_SPAN",
      sourceText: id,
      start: 0,
      end: id.length,
    },
    class: "SUBJECTIVE",
    priority: "REQUIRED",
    prioritySource: "DEFAULT",
    confidence: 1,
  });
}

function contract(requirements: Requirement[]) {
  return AcceptanceContractSchema.parse({
    schemaVersion: "shipcheck-acceptance-contract-v1.0.0",
    contractId: "contract_policy_test",
    compilerVersion: "compiler-v1",
    policyVersion: policy.policyVersion,
    executionPolicyVersion: "public-web-v1",
    target: "https://example.com",
    requirements,
    createdAt: "2026-07-12T10:00:00Z",
    contractHash: "0".repeat(64),
  });
}

function result(
  requirementValue: Requirement,
  status:
    | "PASS"
    | "FAIL"
    | "UNVERIFIED"
    | "NOT_OBJECTIVELY_TESTABLE"
    | "UNSUPPORTED",
): RequirementResult {
  const hasObservation = status === "PASS" || status === "FAIL";
  return RequirementResultSchema.parse({
    requirementId: requirementValue.id,
    priority: requirementValue.priority,
    status,
    checkIds: hasObservation ? [`check_${requirementValue.id}`] : [],
    observationIds: hasObservation ? [`obs_${requirementValue.id}`] : [],
    evidenceIds: [],
    rerunEligible: status === "FAIL" || status === "UNVERIFIED",
  });
}

describe("determineAcceptance", () => {
  it("lets the first systemic-failure rule win over a required failure", () => {
    const required = requirement("req_required");

    expect(
      determineAcceptance(
        contract([required]),
        [result(required, "FAIL")],
        policy,
        "SYSTEMIC_FAILURE",
      ),
    ).toBe("EXECUTION_INCOMPLETE");
  });

  it("returns insufficient specification when nothing is executable", () => {
    const subjective = subjectiveRequirement("req_subjective");

    expect(
      determineAcceptance(
        contract([subjective]),
        [result(subjective, "NOT_OBJECTIVELY_TESTABLE")],
        policy,
        "COMPLETED",
      ),
    ).toBe("INSUFFICIENT_SPECIFICATION");
  });

  it.each([
    ["CRITICAL", "FAIL", "CHANGES_REQUIRED"],
    ["REQUIRED", "FAIL", "CHANGES_REQUIRED"],
    ["CRITICAL", "UNVERIFIED", "EXECUTION_INCOMPLETE"],
    ["REQUIRED", "UNVERIFIED", "ACCEPTED_WITH_NOTES"],
    ["OPTIONAL", "FAIL", "ACCEPTED_WITH_NOTES"],
  ] as const)(
    "maps %s %s through ordered precedence",
    (priority, status, expectedVerdict) => {
      const testedRequirement = requirement("req_tested", priority);

      expect(
        determineAcceptance(
          contract([testedRequirement]),
          [result(testedRequirement, status)],
          policy,
          "COMPLETED",
        ),
      ).toBe(expectedVerdict);
    },
  );

  it("returns accepted with notes when executables pass but a subjective item remains", () => {
    const executable = requirement("req_executable");
    const subjective = subjectiveRequirement("req_subjective");

    expect(
      determineAcceptance(
        contract([executable, subjective]),
        [
          result(executable, "PASS"),
          result(subjective, "NOT_OBJECTIVELY_TESTABLE"),
        ],
        policy,
        "COMPLETED",
      ),
    ).toBe("ACCEPTED_WITH_NOTES");
  });

  it("accepts only when every result passes", () => {
    const required = requirement("req_required");
    const optional = requirement("req_optional", "OPTIONAL");

    expect(
      determineAcceptance(
        contract([required, optional]),
        [result(required, "PASS"), result(optional, "PASS")],
        policy,
        "COMPLETED",
      ),
    ).toBe("ACCEPTED");
  });

  it("rejects a missing requirement result instead of manufacturing a verdict", () => {
    const required = requirement("req_required");

    expect(() =>
      determineAcceptance(contract([required]), [], policy, "COMPLETED"),
    ).toThrow(/result/i);
  });

  it("rejects a pass that has no observation", () => {
    const required = requirement("req_required");
    const invalidPass = RequirementResultSchema.parse({
      requirementId: required.id,
      priority: required.priority,
      status: "PASS",
      checkIds: [],
      observationIds: [],
      evidenceIds: [],
      rerunEligible: false,
    });

    expect(() =>
      determineAcceptance(
        contract([required]),
        [invalidPass],
        policy,
        "COMPLETED",
      ),
    ).toThrow(/observation/i);
  });

  it("rejects a subjective requirement reported as pass", () => {
    const subjective = subjectiveRequirement("req_subjective");
    const fabricatedPass = result(subjective, "PASS");

    expect(() =>
      determineAcceptance(
        contract([subjective]),
        [fabricatedPass],
        policy,
        "COMPLETED",
      ),
    ).toThrow(/subjective/i);
  });
});
