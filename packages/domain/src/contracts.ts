import { z } from "zod";

const HexSha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const HttpsUrlSchema = z.url().refine((value) => value.startsWith("https://"), {
  message: "Expected an HTTPS URL",
});
const VersionSchema = z.string().min(1);

export const ContractIdSchema = z.string().min(1).brand<"ContractId">();
export const RequirementIdSchema = z.string().min(1).brand<"RequirementId">();
export const CheckIdSchema = z.string().min(1).brand<"CheckId">();
export const ObservationIdSchema = z.string().min(1).brand<"ObservationId">();
export const EvidenceIdSchema = z.string().min(1).brand<"EvidenceId">();
export const ReceiptIdSchema = z.string().min(1).brand<"ReceiptId">();

export const RequirementClassSchema = z.enum([
  "EXECUTABLE",
  "AMBIGUOUS",
  "SUBJECTIVE",
  "UNSUPPORTED",
]);

export const RequirementPrioritySchema = z.enum([
  "CRITICAL",
  "REQUIRED",
  "OPTIONAL",
]);

export const PrioritySourceSchema = z.enum([
  "EXPLICIT",
  "INFERRED",
  "DEFAULT",
]);

export const CheckIntentSchema = z.enum([
  "CONTENT_PRESENT",
  "SECTION_PRESENT",
  "LINK_RESOLVES",
  "CTA_NAVIGATES",
  "FORM_ACCEPTS_INPUT",
  "NAVIGATION_WORKS",
  "NO_HORIZONTAL_OVERFLOW",
  "ASSETS_LOAD",
  "NO_SEVERE_CONSOLE_ERRORS",
  "NO_FAILED_SAME_ORIGIN_REQUESTS",
  "HTTPS_ENABLED",
  "METADATA_PRESENT",
  "BASIC_ACCESSIBILITY",
]);

export const BriefSpanProvenanceSchema = z
  .object({
    kind: z.literal("BRIEF_SPAN"),
    sourceText: z.string().min(1),
    start: z.number().int().min(0),
    end: z.number().int().min(1),
  })
  .strict()
  .refine(({ start, end }) => end > start, {
    message: "Source span end must be greater than start",
    path: ["end"],
  });

export const DerivedBaselineProvenanceSchema = z
  .object({
    kind: z.literal("DERIVED_BASELINE"),
    rationale: z.string().min(1),
  })
  .strict();

export const RequirementProvenanceSchema = z.discriminatedUnion("kind", [
  BriefSpanProvenanceSchema,
  DerivedBaselineProvenanceSchema,
]);

const RequirementFields = {
  id: RequirementIdSchema,
  statement: z.string().min(1),
  provenance: RequirementProvenanceSchema,
  priority: RequirementPrioritySchema,
  prioritySource: PrioritySourceSchema,
  confidence: z.number().min(0).max(1),
};

const ExecutableRequirementSchema = z
  .object({
    ...RequirementFields,
    class: z.literal("EXECUTABLE"),
    adapter: z.literal("PUBLIC_WEB"),
    intent: CheckIntentSchema,
    clarification: z.string().min(1).optional(),
  })
  .strict();

const NonExecutableRequirementSchema = (
  requirementClass: "AMBIGUOUS" | "SUBJECTIVE" | "UNSUPPORTED",
) =>
  z
    .object({
      ...RequirementFields,
      class: z.literal(requirementClass),
      clarification: z.string().min(1).optional(),
    })
    .strict();

export const RequirementSchema = z
  .discriminatedUnion("class", [
    ExecutableRequirementSchema,
    NonExecutableRequirementSchema("AMBIGUOUS"),
    NonExecutableRequirementSchema("SUBJECTIVE"),
    NonExecutableRequirementSchema("UNSUPPORTED"),
  ])
  .refine(
    (requirement) =>
      requirement.provenance.kind !== "DERIVED_BASELINE" ||
      (requirement.priority === "OPTIONAL" &&
        requirement.prioritySource === "DEFAULT"),
    {
      message: "Derived baselines must use optional default priority",
      path: ["priority"],
    },
  );

export const VerifyRequestSchema = z
  .object({
    brief: z.string().min(10).max(12_000),
    deliveryUrl: HttpsUrlSchema,
    mode: z.literal("quick").default("quick"),
    maxRequirements: z.number().int().min(1).max(12).default(12),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .strict();

export const AcceptanceContractSchema = z
  .object({
    schemaVersion: z.literal("shipcheck-acceptance-contract-v1.0.0"),
    contractId: ContractIdSchema,
    compilerVersion: VersionSchema,
    policyVersion: VersionSchema,
    executionPolicyVersion: VersionSchema,
    target: HttpsUrlSchema,
    requirements: z.array(RequirementSchema).min(1).max(12),
    createdAt: z.iso.datetime({ offset: true }),
    contractHash: HexSha256Schema,
  })
  .strict()
  .superRefine(({ requirements }, context) => {
    const seen = new Set<string>();
    requirements.forEach((requirement, index) => {
      if (seen.has(requirement.id)) {
        context.addIssue({
          code: "custom",
          message: "Requirement IDs must be unique",
          path: ["requirements", index, "id"],
        });
      }
      seen.add(requirement.id);
    });
  });

const JsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export type JsonValue =
  | z.infer<typeof JsonPrimitiveSchema>
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    JsonPrimitiveSchema,
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const CheckDefinitionSchema = z
  .object({
    checkId: CheckIdSchema,
    requirementId: RequirementIdSchema,
    adapter: z.literal("PUBLIC_WEB"),
    intent: CheckIntentSchema,
    parameters: z.record(z.string(), JsonValueSchema),
  })
  .strict();

export const ObservationStatusSchema = z.enum([
  "OBSERVED_TRUE",
  "OBSERVED_FALSE",
  "INCONCLUSIVE",
  "EXECUTION_ERROR",
]);

export const ObservationSchema = z
  .object({
    observationId: ObservationIdSchema,
    checkId: CheckIdSchema,
    status: ObservationStatusSchema,
    observedAt: z.iso.datetime({ offset: true }),
    summary: z.string().min(1),
    facts: z.record(z.string(), JsonPrimitiveSchema),
    evidenceIds: z.array(EvidenceIdSchema),
  })
  .strict();

export const RequirementResultStatusSchema = z.enum([
  "PASS",
  "FAIL",
  "UNVERIFIED",
  "NOT_OBJECTIVELY_TESTABLE",
  "UNSUPPORTED",
]);

export const RequirementResultSchema = z
  .object({
    requirementId: RequirementIdSchema,
    priority: RequirementPrioritySchema,
    status: RequirementResultStatusSchema,
    checkIds: z.array(CheckIdSchema),
    observationIds: z.array(ObservationIdSchema),
    evidenceIds: z.array(EvidenceIdSchema),
    expected: z.string().min(1).optional(),
    observed: z.string().min(1).optional(),
    repairHint: z.string().min(1).optional(),
    rerunEligible: z.boolean(),
  })
  .strict();

export const EvidenceTypeSchema = z.enum([
  "SCREENSHOT",
  "ELEMENT_SCREENSHOT",
  "TRACE",
  "DOM_EXCERPT",
  "ACCESSIBILITY_SNAPSHOT",
  "HTTP_RECORD",
  "NETWORK_RECORD",
  "CONSOLE_RECORD",
  "TARGET_FINGERPRINT",
]);

export const EvidenceArtifactSchema = z
  .object({
    id: EvidenceIdSchema,
    type: EvidenceTypeSchema,
    sha256: HexSha256Schema,
    contentType: z.string().min(1),
    sizeBytes: z.number().int().min(0),
    storageUrl: z.url().optional(),
    createdAt: z.iso.datetime({ offset: true }),
    redaction: z
      .object({
        applied: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const OverallVerdictSchema = z.enum([
  "ACCEPTED",
  "ACCEPTED_WITH_NOTES",
  "CHANGES_REQUIRED",
  "INSUFFICIENT_SPECIFICATION",
  "EXECUTION_INCOMPLETE",
]);

export const ExecutionStatusSchema = z.enum([
  "COMPLETED",
  "SYSTEMIC_FAILURE",
]);

export const ReceiptSummarySchema = z
  .object({
    total: z.number().int().min(0),
    passed: z.number().int().min(0),
    failed: z.number().int().min(0),
    unverified: z.number().int().min(0),
    notObjectivelyTestable: z.number().int().min(0),
    unsupported: z.number().int().min(0),
  })
  .strict();

export const AcceptanceReceiptSchema = z
  .object({
    receiptSchemaVersion: z.literal("shipcheck-acceptance-receipt-v1.0.0"),
    receiptId: ReceiptIdSchema,
    contractHash: HexSha256Schema,
    contractSchemaVersion: VersionSchema,
    target: HttpsUrlSchema,
    targetFingerprint: z
      .object({
        finalUrl: HttpsUrlSchema,
        sha256: HexSha256Schema,
      })
      .strict(),
    compilerVersion: VersionSchema,
    executionPolicyVersion: VersionSchema,
    adapterVersion: VersionSchema,
    verdict: OverallVerdictSchema,
    summary: ReceiptSummarySchema,
    results: z.array(RequirementResultSchema),
    evidenceManifestHash: HexSha256Schema,
    policyVersion: VersionSchema,
    testedAt: z.iso.datetime({ offset: true }),
    receiptHash: HexSha256Schema,
    anchor: z
      .object({
        network: z.string().min(1),
        transactionHash: z.string().min(1),
      })
      .strict()
      .nullable()
      .optional(),
    signature: z
      .object({
        algorithm: z.string().min(1),
        keyId: z.string().min(1),
        value: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export const AcceptancePolicyConditionSchema = z.enum([
  "SYSTEMIC_EXECUTION_FAILURE",
  "NO_EXECUTABLE_REQUIREMENTS",
  "ANY_CRITICAL_FAIL",
  "ANY_REQUIRED_FAIL",
  "ANY_CRITICAL_UNVERIFIED",
  "ANY_REQUIRED_UNVERIFIED",
  "ANY_NON_PASS_RESULT",
  "OTHERWISE",
]);

export const AcceptancePolicySchema = z
  .object({
    policyVersion: VersionSchema,
    minimumExecutableRequiredForAcceptance: z.number().int().min(1),
    precedence: z
      .array(
        z
          .object({
            condition: AcceptancePolicyConditionSchema,
            verdict: OverallVerdictSchema,
          })
          .strict(),
      )
      .min(1),
    notes: z.array(z.string()),
  })
  .strict()
  .superRefine(({ precedence }, context) => {
    const conditions = precedence.map(({ condition }) => condition);
    if (new Set(conditions).size !== conditions.length) {
      context.addIssue({
        code: "custom",
        message: "Acceptance policy conditions must be unique",
        path: ["precedence"],
      });
    }
    if (precedence.at(-1)?.condition !== "OTHERWISE") {
      context.addIssue({
        code: "custom",
        message: "Acceptance policy must end with OTHERWISE",
        path: ["precedence"],
      });
    }
  });

export type RequirementProvenance = z.infer<
  typeof RequirementProvenanceSchema
>;
export type ContractId = z.infer<typeof ContractIdSchema>;
export type RequirementId = z.infer<typeof RequirementIdSchema>;
export type CheckId = z.infer<typeof CheckIdSchema>;
export type ObservationId = z.infer<typeof ObservationIdSchema>;
export type EvidenceId = z.infer<typeof EvidenceIdSchema>;
export type ReceiptId = z.infer<typeof ReceiptIdSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;
export type AcceptanceContract = z.infer<typeof AcceptanceContractSchema>;
export type CheckDefinition = z.infer<typeof CheckDefinitionSchema>;
export type Observation = z.infer<typeof ObservationSchema>;
export type RequirementResult = z.infer<typeof RequirementResultSchema>;
export type EvidenceArtifact = z.infer<typeof EvidenceArtifactSchema>;
export type AcceptanceReceipt = z.infer<typeof AcceptanceReceiptSchema>;
export type AcceptancePolicy = z.infer<typeof AcceptancePolicySchema>;
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;
export type OverallVerdict = z.infer<typeof OverallVerdictSchema>;

export function validateRequirementProvenance(
  provenance: RequirementProvenance,
  brief: string,
): boolean {
  if (provenance.kind === "DERIVED_BASELINE") {
    return true;
  }

  return (
    provenance.end > provenance.start &&
    brief.slice(provenance.start, provenance.end) === provenance.sourceText
  );
}
