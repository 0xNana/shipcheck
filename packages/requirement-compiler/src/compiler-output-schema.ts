import {
  CheckIntentSchema,
  PrioritySourceSchema,
  RequirementClassSchema,
  RequirementPrioritySchema,
  RequirementSchema,
} from "@shipcheck/domain";
import { z } from "zod";

/**
 * Flat schema for OpenAI strict json_schema — no oneOf/discriminated unions.
 * Validated output is parsed again with {@link RequirementSchema}.
 */
const CompilerProvenanceCandidateSchema = z
  .object({
    kind: z.enum(["BRIEF_SPAN", "DERIVED_BASELINE"]),
    sourceText: z.string().min(1).optional(),
    start: z.number().int().min(0).optional(),
    end: z.number().int().min(1).optional(),
    rationale: z.string().min(1).optional(),
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
    adapter: z.literal("PUBLIC_WEB").optional(),
    intent: CheckIntentSchema.optional(),
    clarification: z.string().min(1).optional(),
  })
  .strict();

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

export const CompilerOutputRequirementsSchema = z
  .array(RequirementSchema)
  .min(1)
  .max(12);

export function compilerOutputResponseSchema(): Record<string, unknown> {
  return z.toJSONSchema(CompilerOutputCandidateSchema) as Record<
    string,
    unknown
  >;
}
