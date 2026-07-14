import {
  AcceptanceContractSchema,
  AcceptanceReceiptSchema,
  EvidenceManifestSchema,
  RequirementResultSchema,
  hashAcceptanceContract,
  hashAcceptanceReceipt,
  hashEvidenceManifest,
} from "@shipcheck/domain";
import type { ReportBundle } from "@shipcheck/service-core";

export const DEMO_RECEIPT_ID = "demo";

/**
 * Canonical marketplace demo: CHANGES_REQUIRED with missing pricing and a failing waitlist.
 * Matches the `/demo` fixture narrative documented in README.
 */
export function buildDemoReportBundle(): ReportBundle {
  const contractBody = {
    schemaVersion: "shipcheck-acceptance-contract-v1.0.0" as const,
    contractId: "contract_demo_001",
    compilerVersion: "shipcheck-openai-compiler-v1.0.0",
    policyVersion: "shipcheck-acceptance-v1.0.0",
    executionPolicyVersion: "shipcheck-public-web-v1.0.0",
    target: "https://fixture.local/demo",
    requirements: [
      {
        id: "req_pricing",
        statement: "A pricing section is present.",
        provenance: {
          kind: "BRIEF_SPAN" as const,
          sourceText: "pricing",
          start: 25,
          end: 32,
        },
        priority: "REQUIRED" as const,
        prioritySource: "DEFAULT" as const,
        confidence: 1,
        class: "EXECUTABLE" as const,
        adapter: "PUBLIC_WEB" as const,
        intent: "SECTION_PRESENT" as const,
      },
      {
        id: "req_waitlist",
        statement: "Waitlist form accepts a valid email.",
        provenance: {
          kind: "BRIEF_SPAN" as const,
          sourceText: "waitlist",
          start: 40,
          end: 48,
        },
        priority: "CRITICAL" as const,
        prioritySource: "EXPLICIT" as const,
        confidence: 1,
        class: "EXECUTABLE" as const,
        adapter: "PUBLIC_WEB" as const,
        intent: "FORM_ACCEPTS_INPUT" as const,
      },
    ],
    createdAt: "2026-07-11T20:00:00.000Z",
  };
  const contract = AcceptanceContractSchema.parse({
    ...contractBody,
    contractHash: hashAcceptanceContract(contractBody),
  });

  const passed = RequirementResultSchema.parse({
    requirementId: "req_pricing",
    priority: "REQUIRED",
    status: "FAIL",
    checkIds: ["check_pricing"],
    observationIds: ["obs_pricing"],
    evidenceIds: ["ev_pricing"],
    expected: "A pricing section is present.",
    observed: "No element matching id=\"pricing\" was found.",
    repairHint: "Add a visible pricing section to the launch page.",
    rerunEligible: true,
  });

  const failed = RequirementResultSchema.parse({
    requirementId: "req_waitlist",
    priority: "CRITICAL",
    status: "FAIL",
    checkIds: ["check_waitlist"],
    observationIds: ["obs_waitlist"],
    evidenceIds: ["ev_waitlist"],
    expected: "Waitlist form accepts a valid email.",
    observed: "POST /api/waitlist-failure returned 500.",
    repairHint: "Inspect the waitlist API and return a visible success state.",
    rerunEligible: true,
  });

  const evidenceBody = {
    schemaVersion: "shipcheck-evidence-manifest-v1.0.0" as const,
    artifacts: [
      {
        id: "ev_pricing",
        type: "SCREENSHOT" as const,
        sha256: "a".repeat(64),
        contentType: "image/png",
        sizeBytes: 184_320,
        createdAt: "2026-07-11T20:00:01.000Z",
        redaction: { applied: false },
      },
      {
        id: "ev_waitlist",
        type: "HTTP_RECORD" as const,
        sha256: "b".repeat(64),
        contentType: "application/json",
        sizeBytes: 96,
        createdAt: "2026-07-11T20:00:01.000Z",
        redaction: { applied: true },
      },
    ],
  };
  const evidenceManifest = EvidenceManifestSchema.parse({
    schemaVersion: "shipcheck-evidence-manifest-v1.0.0" as const,
    artifacts: evidenceBody.artifacts,
    evidenceManifestHash: hashEvidenceManifest(evidenceBody.artifacts),
  });

  const receiptDraft = {
    receiptSchemaVersion: "shipcheck-acceptance-receipt-v1.0.0" as const,
    receiptId: DEMO_RECEIPT_ID,
    contractHash: contract.contractHash,
    contractSchemaVersion: contract.schemaVersion,
    target: contract.target,
    targetFingerprint: {
      finalUrl: contract.target,
      sha256: "c".repeat(64),
    },
    compilerVersion: contract.compilerVersion,
    executionPolicyVersion: contract.executionPolicyVersion,
    adapterVersion: "shipcheck-public-web-v1.0.0",
    evidenceManifestVersion: evidenceManifest.schemaVersion,
    verdict: "CHANGES_REQUIRED" as const,
    summary: {
      total: 2,
      passed: 0,
      failed: 2,
      unverified: 0,
      notObjectivelyTestable: 0,
      unsupported: 0,
    },
    results: [passed, failed],
    evidenceManifestHash: evidenceManifest.evidenceManifestHash,
    policyVersion: contract.policyVersion,
    testedAt: "2026-07-11T20:00:01.000Z",
  };
  const receipt = AcceptanceReceiptSchema.parse({
    ...receiptDraft,
    receiptHash: hashAcceptanceReceipt(receiptDraft),
  });

  return {
    receiptId: DEMO_RECEIPT_ID,
    contract,
    results: [passed, failed],
    receipt,
    evidenceManifest,
    createdAt: "2026-07-11T20:00:02.000Z",
  };
}
