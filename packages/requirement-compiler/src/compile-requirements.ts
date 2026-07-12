import {
  AcceptanceContractSchema,
  CheckIntentSchema,
  RequirementSchema,
  VerifyRequestSchema,
  hashAcceptanceContract,
  validateRequirementProvenance,
} from "@shipcheck/domain";
import { z } from "zod";

import { buildCompilerPrompt } from "./prompt.js";
import { normalizeAndDeduplicateRequirements } from "./normalize-requirements.js";
import type {
  CompiledAcceptanceContract,
  RequirementCompilerOptions,
} from "./types.js";

const CompilerOutputSchema = z
  .object({
    requirements: z.array(RequirementSchema).min(1).max(12),
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

interface ValidCompilerOutput {
  readonly success: true;
  readonly requirements: z.infer<typeof RequirementSchema>[];
}

interface InvalidCompilerOutput {
  readonly success: false;
  readonly issues: string[];
}

type CompilerOutputValidation = ValidCompilerOutput | InvalidCompilerOutput;

function validateCompilerOutput(
  rawOutput: unknown,
  brief: string,
  maxRequirements: number,
): CompilerOutputValidation {
  const parsed = CompilerOutputSchema.safeParse(rawOutput);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "output"}: ${issue.message}`,
      ),
    };
  }

  const issues: string[] = [];
  for (const requirement of parsed.data.requirements) {
    if (!validateRequirementProvenance(requirement.provenance, brief)) {
      issues.push(
        `requirements.${requirement.id}.provenance: source span does not match the brief`,
      );
    }
  }

  const normalizedRequirements = normalizeAndDeduplicateRequirements(
    parsed.data.requirements,
  );
  if (normalizedRequirements.length > maxRequirements) {
    issues.push("requirements: normalized output exceeds maxRequirements");
  }

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, requirements: normalizedRequirements };
}

export class RequirementCompilationError extends Error {
  readonly code = "COMPILATION_FAILED" as const;

  constructor(readonly issues: readonly string[]) {
    super("Requirement compiler returned invalid output after one repair");
    this.name = "RequirementCompilationError";
  }
}

export async function compileRequirements(
  input: unknown,
  options: RequirementCompilerOptions,
): Promise<CompiledAcceptanceContract> {
  const request = VerifyRequestSchema.parse(input);
  const allowedIntents = CheckIntentSchema.options;
  const systemPrompt = buildCompilerPrompt(allowedIntents);
  const responseSchema = z.toJSONSchema(CompilerOutputSchema);
  const firstOutput = await options.model.generate({
    systemPrompt,
    brief: request.brief,
    maxRequirements: request.maxRequirements,
    allowedIntents,
    responseSchema,
    isRepair: false,
  });
  const firstValidation = validateCompilerOutput(
    firstOutput,
    request.brief,
    request.maxRequirements,
  );

  let requirements: z.infer<typeof RequirementSchema>[];
  if (firstValidation.success) {
    requirements = firstValidation.requirements;
  } else {
    const repairedOutput = await options.model.generate({
      systemPrompt: buildCompilerPrompt(allowedIntents),
      brief: request.brief,
      maxRequirements: request.maxRequirements,
      allowedIntents,
      responseSchema,
      isRepair: true,
      issues: firstValidation.issues,
    });
    const repairedValidation = validateCompilerOutput(
      repairedOutput,
      request.brief,
      request.maxRequirements,
    );
    if (!repairedValidation.success) {
      throw new RequirementCompilationError(repairedValidation.issues);
    }
    requirements = repairedValidation.requirements;
  }

  const contractBody = {
    schemaVersion: "shipcheck-acceptance-contract-v1.0.0" as const,
    contractId: options.createContractId(),
    compilerVersion: options.compilerVersion,
    policyVersion: options.policyVersion,
    executionPolicyVersion: options.executionPolicyVersion,
    target: new URL(request.deliveryUrl).toString(),
    requirements,
    createdAt: options.now(),
  };

  return AcceptanceContractSchema.parse({
    ...contractBody,
    contractHash: hashAcceptanceContract(contractBody),
  });
}
