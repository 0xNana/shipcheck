import {
  CheckIntentSchema,
  PrioritySourceSchema,
  RequirementClassSchema,
  RequirementPrioritySchema,
  RequirementSchema,
  type Requirement,
} from "@shipcheck/domain";
import { z } from "zod";

/**
 * OpenAI strict json_schema requires every property key to appear in `required`
 * (no optional keys). Use empty strings / zero sentinels for unused fields;
 * {@link normalizeCompilerCandidateRequirement} strips them before domain parse.
 */
const CompilerProvenanceCandidateSchema = z
  .object({
    kind: z.enum(["BRIEF_SPAN", "DERIVED_BASELINE"]),
    sourceText: z.string(),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    rationale: z.string(),
  })
  .strict();

export const CompilerRequirementCandidateSchema = z
  .object({
    id: z.string().min(1),
    statement: z.string().min(1),
    class: RequirementClassSchema,
    provenance: CompilerProvenanceCandidateSchema,
    priority: RequirementPrioritySchema,
    prioritySource: PrioritySourceSchema,
    confidence: z.number().min(0).max(1),
    /** `PUBLIC_WEB` when class is EXECUTABLE; otherwise empty string. */
    adapter: z.string(),
    /** Check intent when class is EXECUTABLE; otherwise empty string. */
    intent: z.string(),
    /** Optional clarification; empty string when absent. */
    clarification: z.string(),
  })
  .strict();

export type CompilerRequirementCandidate = z.infer<
  typeof CompilerRequirementCandidateSchema
>;

export const CompilerOutputCandidateSchema = z
  .object({
    requirements: z.array(CompilerRequirementCandidateSchema).min(1).max(12),
  })
  .strict()
  .superRefine(({ requirements }, context) => {
    const ids = new Set<string>();
    requirements.forEach((requirement, index) => {
      if (ids.has(requirement.id)) {
        context.addIssue({
          code: "custom",
          message: "Candidate requirement IDs must be unique",
          path: ["requirements", index, "id"],
        });
      }
      ids.add(requirement.id);
    });
  });

export function normalizeCompilerCandidateRequirement(
  candidate: CompilerRequirementCandidate,
): unknown {
  const provenance =
    candidate.provenance.kind === "BRIEF_SPAN"
      ? {
          kind: "BRIEF_SPAN" as const,
          sourceText: candidate.provenance.sourceText,
          start: candidate.provenance.start,
          end: candidate.provenance.end,
        }
      : {
          kind: "DERIVED_BASELINE" as const,
          rationale: candidate.provenance.rationale,
        };

  const base = {
    id: candidate.id,
    statement: candidate.statement,
    class: candidate.class,
    provenance,
    priority: candidate.priority,
    prioritySource: candidate.prioritySource,
    confidence: candidate.confidence,
    ...(candidate.clarification.length > 0
      ? { clarification: candidate.clarification }
      : {}),
  };

  if (candidate.class === "EXECUTABLE") {
    return {
      ...base,
      adapter: "PUBLIC_WEB" as const,
      intent: candidate.intent,
    };
  }

  return base;
}

export function normalizeCompilerCandidateOutput(
  output: z.infer<typeof CompilerOutputCandidateSchema>,
): unknown[] {
  return output.requirements.map(normalizeCompilerCandidateRequirement);
}

export function compilerOutputResponseSchema(): Record<string, unknown> {
  return z.toJSONSchema(CompilerOutputCandidateSchema) as Record<
    string,
    unknown
  >;
}

/** Validates OpenAI strict json_schema shape (every object lists all property keys as required). */
export function assertOpenAiStrictJsonSchema(
  schema: unknown,
  path = "root",
): void {
  if (typeof schema !== "object" || schema === null) {
    return;
  }
  const node = schema as Record<string, unknown>;
  if (node["type"] === "object" && node["properties"] !== undefined) {
    const properties = node["properties"] as Record<string, unknown>;
    const keys = Object.keys(properties).sort();
    const required = [...((node["required"] as string[] | undefined) ?? [])].sort();
    if (keys.join(",") !== required.join(",")) {
      throw new Error(
        `OpenAI strict schema mismatch at ${path}: properties [${keys.join(", ")}] vs required [${required.join(", ")}]`,
      );
    }
    for (const key of keys) {
      assertOpenAiStrictJsonSchema(properties[key], `${path}.${key}`);
    }
  }
  if (node["type"] === "array" && node["items"] !== undefined) {
    assertOpenAiStrictJsonSchema(node["items"], `${path}[]`);
  }
}

export function parseCompilerRequirementsFromModelOutput(
  rawOutput: unknown,
): z.SafeParseReturnType<unknown, Requirement[]> {
  const candidate = CompilerOutputCandidateSchema.safeParse(rawOutput);
  if (!candidate.success) {
    return candidate as z.SafeParseReturnType<unknown, Requirement[]>;
  }
  return z.array(RequirementSchema).safeParse(
    normalizeCompilerCandidateOutput(candidate.data),
  );
}
