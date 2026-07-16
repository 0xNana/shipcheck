import {
  AcceptanceContractSchema,
  CheckIntentSchema,
  RequirementSchema,
  VerifyRequestSchema,
  hashAcceptanceContract,
  validateRequirementProvenance,
} from "@shipcheck/domain";
import type { z } from "zod";

import { buildCompilerPrompt } from "./prompt.js";
import { normalizeAndDeduplicateRequirements } from "./normalize-requirements.js";
import {
  compilerOutputResponseSchema,
  parseCompilerRequirementsFromModelOutput,
} from "./compiler-output-schema.js";
import type {
  CompiledAcceptanceContract,
  RequirementCompilerOptions,
} from "./types.js";

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
  const requirementParse = parseCompilerRequirementsFromModelOutput(rawOutput);
  if (!requirementParse.success) {
    return {
      success: false,
      issues: requirementParse.error.issues.map(
        (issue) => `${issue.path.join(".") || "output"}: ${issue.message}`,
      ),
    };
  }

  const issues: string[] = [];
  for (const requirement of requirementParse.data) {
    if (!validateRequirementProvenance(requirement.provenance, brief)) {
      issues.push(
        `requirements.${requirement.id}.provenance: source span does not match the brief`,
      );
    }
  }

  const normalizedRequirements = normalizeAndDeduplicateRequirements(
    requirementParse.data,
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

const baselineRequirements = [
  {
    id: "REQ-BASELINE-HTTPS",
    statement: "The website is accessible over HTTPS.",
    intent: "HTTPS_ENABLED",
    rationale: "Baseline public-site availability check.",
  },
  {
    id: "REQ-BASELINE-ASSETS",
    statement: "The website loads its required page assets successfully.",
    intent: "ASSETS_LOAD",
    rationale: "Baseline public-site asset health check.",
  },
  {
    id: "REQ-BASELINE-CONSOLE",
    statement: "The website produces no severe browser console errors.",
    intent: "NO_SEVERE_CONSOLE_ERRORS",
    rationale: "Baseline public-site browser health check.",
  },
  {
    id: "REQ-BASELINE-NETWORK",
    statement: "The website has no failed same-origin network requests.",
    intent: "NO_FAILED_SAME_ORIGIN_REQUESTS",
    rationale: "Baseline public-site network health check.",
  },
] as const;

function buildContract(
  request: z.infer<typeof VerifyRequestSchema>,
  requirements: z.infer<typeof RequirementSchema>[],
  options: RequirementCompilerOptions,
): CompiledAcceptanceContract {
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

export function compileBaselineRequirements(
  input: unknown,
  options: RequirementCompilerOptions,
): CompiledAcceptanceContract {
  const request = VerifyRequestSchema.parse(input);
  const requirements = baselineRequirements
    .slice(0, Math.min(request.maxRequirements, baselineRequirements.length))
    .map((baseline) =>
      RequirementSchema.parse({
        id: baseline.id,
        statement: baseline.statement,
        provenance: {
          kind: "DERIVED_BASELINE",
          rationale: baseline.rationale,
        },
        priority: "OPTIONAL",
        prioritySource: "DEFAULT",
        confidence: 1,
        class: "EXECUTABLE",
        adapter: "PUBLIC_WEB",
        intent: baseline.intent,
      }),
    );

  return buildContract(request, requirements, options);
}

export async function compileRequirements(
  input: unknown,
  options: RequirementCompilerOptions,
  signal?: AbortSignal,
): Promise<CompiledAcceptanceContract> {
  signal?.throwIfAborted();
  const request = VerifyRequestSchema.parse(input);
  const allowedIntents = CheckIntentSchema.options;
  const systemPrompt = buildCompilerPrompt(allowedIntents);
  const responseSchema = compilerOutputResponseSchema();
  const firstOutput = await options.model.generate({
    systemPrompt,
    brief: request.brief,
    maxRequirements: request.maxRequirements,
    allowedIntents,
    responseSchema,
    isRepair: false,
    ...(signal === undefined ? {} : { signal }),
  });
  signal?.throwIfAborted();
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
      ...(signal === undefined ? {} : { signal }),
    });
    signal?.throwIfAborted();
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

  return buildContract(request, requirements, options);
}
