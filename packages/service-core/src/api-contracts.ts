import {
  AcceptanceContractSchema,
  AcceptanceReceiptSchema,
  EvidenceManifestSchema,
  OverallVerdictSchema,
  ReceiptSummarySchema,
  RequirementResultSchema,
} from "@shipcheck/domain";
import { z } from "zod";

export const ApiErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "UNSAFE_TARGET",
  "COMPILATION_FAILED",
  "REQUEST_CONFLICT",
  "NOT_FOUND",
  "RATE_LIMITED",
  "EXECUTION_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const ApiErrorBodySchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1),
        details: z.unknown().optional(),
        requestId: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const VerifyResponseSchema = z
  .object({
    requestId: z.string().min(1),
    contract: AcceptanceContractSchema,
    verdict: OverallVerdictSchema,
    summary: ReceiptSummarySchema,
    results: z.array(RequirementResultSchema),
    receipt: AcceptanceReceiptSchema,
    reportUrl: z.url().optional(),
  })
  .strict();

export const RequestStatusResponseSchema = z
  .object({
    requestId: z.string().min(1),
    status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]),
    response: VerifyResponseSchema.optional(),
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1),
        details: z.unknown().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ReceiptVerificationResponseSchema = z
  .object({
    receiptId: z.string().min(1),
    valid: z.boolean(),
    checks: z.record(z.string(), z.boolean()),
  })
  .strict();

export const ReportBundleResponseSchema = z
  .object({
    receiptId: z.string().min(1),
    contract: AcceptanceContractSchema,
    verdict: OverallVerdictSchema,
    summary: ReceiptSummarySchema,
    results: z.array(RequirementResultSchema),
    receipt: AcceptanceReceiptSchema,
    evidenceManifest: EvidenceManifestSchema,
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const EvidenceLinkResponseSchema = z
  .object({
    receiptId: z.string().min(1),
    evidenceId: z.string().min(1),
    url: z.url(),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
export type RequestStatusResponse = z.infer<
  typeof RequestStatusResponseSchema
>;
export type ReceiptVerificationResponse = z.infer<
  typeof ReceiptVerificationResponseSchema
>;
export type ReportBundleResponse = z.infer<typeof ReportBundleResponseSchema>;
export type EvidenceLinkResponse = z.infer<typeof EvidenceLinkResponseSchema>;
