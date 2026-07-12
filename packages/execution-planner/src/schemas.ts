import {
  CheckIdSchema,
  RequirementIdSchema,
} from "@shipcheck/domain";
import { z } from "zod";

const SemanticTargetSchema = z.string().min(1).max(1_000);
const ViewportsSchema = z.tuple([
  z.literal("DESKTOP"),
  z.literal("MOBILE"),
]);

const CheckFields = {
  checkId: CheckIdSchema,
  requirementId: RequirementIdSchema,
  adapter: z.literal("PUBLIC_WEB"),
};

function semanticCheck(intent: "CONTENT_PRESENT" | "SECTION_PRESENT" | "LINK_RESOLVES" | "CTA_NAVIGATES") {
  return z
    .object({
      ...CheckFields,
      intent: z.literal(intent),
      parameters: z.object({ semanticTarget: SemanticTargetSchema }).strict(),
    })
    .strict();
}

export const PlannedCheckSchema = z.discriminatedUnion("intent", [
  semanticCheck("CONTENT_PRESENT"),
  semanticCheck("SECTION_PRESENT"),
  semanticCheck("LINK_RESOLVES"),
  semanticCheck("CTA_NAVIGATES"),
  z
    .object({
      ...CheckFields,
      intent: z.literal("FORM_ACCEPTS_INPUT"),
      parameters: z
        .object({
          semanticTarget: SemanticTargetSchema,
          inputProfile: z.literal("SAFE_TEST_EMAIL"),
          successSignals: z.tuple([
            z.literal("VISIBLE_CONFIRMATION"),
            z.literal("SUCCESSFUL_SAME_ORIGIN_RESPONSE"),
          ]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...CheckFields,
      intent: z.literal("NAVIGATION_WORKS"),
      parameters: z
        .object({
          semanticTarget: SemanticTargetSchema,
          viewports: ViewportsSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...CheckFields,
      intent: z.literal("NO_HORIZONTAL_OVERFLOW"),
      parameters: z
        .object({ viewports: ViewportsSchema, tolerancePixels: z.literal(1) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...CheckFields,
      intent: z.literal("ASSETS_LOAD"),
      parameters: z.object({ requiredImagesOnly: z.literal(true) }).strict(),
    })
    .strict(),
  z
    .object({
      ...CheckFields,
      intent: z.literal("NO_SEVERE_CONSOLE_ERRORS"),
      parameters: z.object({ minimumLevel: z.literal("ERROR") }).strict(),
    })
    .strict(),
  z
    .object({
      ...CheckFields,
      intent: z.literal("NO_FAILED_SAME_ORIGIN_REQUESTS"),
      parameters: z
        .object({ failureStatusThreshold: z.number().int().min(400).max(599) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...CheckFields,
      intent: z.literal("HTTPS_ENABLED"),
      parameters: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...CheckFields,
      intent: z.literal("METADATA_PRESENT"),
      parameters: z
        .object({ fields: z.tuple([z.literal("TITLE"), z.literal("DESCRIPTION")]) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...CheckFields,
      intent: z.literal("BASIC_ACCESSIBILITY"),
      parameters: z
        .object({
          checks: z.tuple([
            z.literal("DOCUMENT_LANGUAGE"),
            z.literal("PAGE_TITLE"),
            z.literal("IMAGE_ALT"),
            z.literal("FORM_LABELS"),
          ]),
        })
        .strict(),
    })
    .strict(),
]);

const ViewportSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export const BlockedActionClassSchema = z.enum([
  "AUTHENTICATION",
  "PAYMENT",
  "WALLET",
  "DESTRUCTIVE",
  "FILE_UPLOAD",
  "PERMISSION_GRANT",
  "DOWNLOAD_EXECUTABLE",
]);

export const ExecutionPolicySchema = z
  .object({
    policyVersion: z.string().min(1),
    allowedSchemes: z.tuple([z.literal("https")]),
    allowedPorts: z.tuple([z.literal(443)]),
    maxRedirects: z.number().int().min(0).max(10),
    maxPages: z.number().int().min(1).max(10),
    maxPopups: z.number().int().min(0).max(5),
    desktopViewport: ViewportSchema,
    mobileViewport: ViewportSchema,
    maxRequirements: z.number().int().min(1).max(12),
    maxExecutableRequirementsQuick: z.number().int().min(1).max(8),
    blockedActionClasses: z.array(BlockedActionClassSchema),
    captureTraceOn: z.array(z.enum(["FAIL", "EXECUTION_ERROR"])),
    sameOriginNetworkFailureThreshold: z.number().int().min(400).max(599),
  })
  .strict()
  .refine(
    ({ maxExecutableRequirementsQuick, maxRequirements }) =>
      maxExecutableRequirementsQuick <= maxRequirements,
    {
      message: "Executable requirement limit cannot exceed total limit",
      path: ["maxExecutableRequirementsQuick"],
    },
  );

export const ExecutionPlanSchema = z
  .object({
    planVersion: z.literal("shipcheck-execution-plan-v1.0.0"),
    contractHash: z.string().regex(/^[a-f0-9]{64}$/u),
    target: z.url().refine((value) => value.startsWith("https://"), {
      message: "Expected an HTTPS URL",
    }),
    executionPolicyVersion: z.string().min(1),
    checks: z.array(PlannedCheckSchema),
  })
  .strict();

export type PlannedCheck = z.infer<typeof PlannedCheckSchema>;
export type ExecutionPolicy = z.infer<typeof ExecutionPolicySchema>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
