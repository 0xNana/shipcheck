import {
  AcceptanceContractSchema,
  AcceptanceReceiptSchema,
  EvidenceManifestSchema,
  RequirementResultSchema,
  hashAcceptanceReceipt,
} from "@shipcheck/domain";
import type { ReportBundleResponse } from "@shipcheck/service-core";
import { describe, expect, it } from "vitest";

import { buildReportView } from "../src/index.js";

const contract = AcceptanceContractSchema.parse({
  schemaVersion: "shipcheck-acceptance-contract-v1.0.0",
  contractId: "contract_1",
  compilerVersion: "compiler-v1",
  policyVersion: "policy-v1",
  executionPolicyVersion: "execution-v1",
  target: "https://example.com/",
  requirements: [
    {
      id: "req_1",
      statement: "A pricing section is present.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "pricing",
        start: 25,
        end: 32,
      },
      priority: "REQUIRED",
      prioritySource: "DEFAULT",
      confidence: 1,
      class: "EXECUTABLE",
      adapter: "PUBLIC_WEB",
      intent: "SECTION_PRESENT",
    },
    {
      id: "req_2",
      statement: "Waitlist form accepts a valid email.",
      provenance: {
        kind: "BRIEF_SPAN",
        sourceText: "waitlist",
        start: 40,
        end: 48,
      },
      priority: "CRITICAL",
      prioritySource: "EXPLICIT",
      confidence: 1,
      class: "EXECUTABLE",
      adapter: "PUBLIC_WEB",
      intent: "FORM_ACCEPTS_INPUT",
    },
  ],
  createdAt: "2026-07-12T20:00:00.000Z",
  contractHash: "a".repeat(64),
});

const passed = RequirementResultSchema.parse({
  requirementId: "req_1",
  priority: "REQUIRED",
  status: "PASS",
  checkIds: ["check_1"],
  observationIds: ["obs_1"],
  evidenceIds: ["ev_1"],
  expected: "A pricing section is present.",
  observed: "Pricing was visible.",
  rerunEligible: false,
});

const failed = RequirementResultSchema.parse({
  requirementId: "req_2",
  priority: "CRITICAL",
  status: "FAIL",
  checkIds: ["check_2"],
  observationIds: ["obs_2"],
  evidenceIds: ["ev_2"],
  expected: "Waitlist form accepts a valid email.",
  observed: "POST /api/waitlist returned 500",
  repairHint: "Inspect the waitlist API and return a visible success state.",
  rerunEligible: true,
});

const receiptDraft = {
  receiptSchemaVersion: "shipcheck-acceptance-receipt-v1.0.0" as const,
  receiptId: "receipt_1",
  contractHash: contract.contractHash,
  contractSchemaVersion: contract.schemaVersion,
  target: contract.target,
  targetFingerprint: {
    finalUrl: contract.target,
    sha256: "b".repeat(64),
  },
  compilerVersion: contract.compilerVersion,
  executionPolicyVersion: contract.executionPolicyVersion,
  adapterVersion: "adapter-v1",
  evidenceManifestVersion: "shipcheck-evidence-manifest-v1.0.0" as const,
  verdict: "CHANGES_REQUIRED" as const,
  summary: {
    total: 2,
    passed: 1,
    failed: 1,
    unverified: 0,
    notObjectivelyTestable: 0,
    unsupported: 0,
  },
  results: [passed, failed],
  evidenceManifestHash: "c".repeat(64),
  policyVersion: contract.policyVersion,
  testedAt: "2026-07-12T20:00:01.000Z",
};

const receipt = AcceptanceReceiptSchema.parse({
  ...receiptDraft,
  receiptHash: hashAcceptanceReceipt(receiptDraft),
});

const evidenceManifest = EvidenceManifestSchema.parse({
  schemaVersion: "shipcheck-evidence-manifest-v1.0.0",
  artifacts: [
    {
      id: "ev_1",
      type: "SCREENSHOT",
      sha256: "d".repeat(64),
      contentType: "image/png",
      sizeBytes: 1200,
      createdAt: "2026-07-12T20:00:01.000Z",
      redaction: { applied: false },
    },
    {
      id: "ev_2",
      type: "HTTP_RECORD",
      sha256: "e".repeat(64),
      contentType: "application/json",
      sizeBytes: 80,
      createdAt: "2026-07-12T20:00:01.000Z",
      redaction: { applied: true },
    },
  ],
  evidenceManifestHash: receipt.evidenceManifestHash,
});

const bundle: ReportBundleResponse = {
  receiptId: receipt.receiptId,
  contract,
  verdict: receipt.verdict,
  summary: receipt.summary,
  results: [passed, failed],
  receipt,
  evidenceManifest,
  createdAt: "2026-07-12T20:00:02.000Z",
};

describe("buildReportView", () => {
  it("maps a report bundle into a display model with text verdict metadata", () => {
    const view = buildReportView(bundle);

    expect(view.receiptId).toBe("receipt_1");
    expect(view.verdict).toEqual({
      value: "CHANGES_REQUIRED",
      label: "Changes required",
      icon: "changes_required",
      description:
        "One or more critical or required acceptance checks failed.",
    });
    expect(view.summary).toEqual(bundle.summary);
    expect(view.receiptHash).toBe(receipt.receiptHash);
    expect(view.target).toBe("https://example.com/");
    expect(view.testedAt).toBe(receipt.testedAt);
    expect(view.createdAt).toBe(bundle.createdAt);
  });

  it("joins requirement statements with expected, observed, and repair hints", () => {
    const view = buildReportView(bundle);

    expect(view.requirements).toHaveLength(2);
    expect(view.requirements[0]).toMatchObject({
      requirementId: "req_1",
      statement: "A pricing section is present.",
      status: "PASS",
      statusLabel: "Pass",
      expected: "A pricing section is present.",
      observed: "Pricing was visible.",
      evidenceIds: ["ev_1"],
      rerunEligible: false,
    });
    expect(view.requirements[0]?.repairHint).toBeUndefined();
    expect(view.requirements[1]).toMatchObject({
      requirementId: "req_2",
      statement: "Waitlist form accepts a valid email.",
      status: "FAIL",
      statusLabel: "Fail",
      expected: "Waitlist form accepts a valid email.",
      observed: "POST /api/waitlist returned 500",
      repairHint:
        "Inspect the waitlist API and return a visible success state.",
      evidenceIds: ["ev_2"],
      rerunEligible: true,
    });
  });

  it("exposes evidence catalog entries and the acceptance limitation notice", () => {
    const view = buildReportView(bundle);

    expect(view.evidence).toEqual([
      {
        evidenceId: "ev_1",
        type: "SCREENSHOT",
        typeLabel: "Screenshot",
        contentType: "image/png",
        sizeBytes: 1200,
      },
      {
        evidenceId: "ev_2",
        type: "HTTP_RECORD",
        typeLabel: "HTTP record",
        contentType: "application/json",
        sizeBytes: 80,
      },
    ]);
    expect(view.limitationNotice.acceptedMeans).toContain(
      "no critical or required acceptance failure was observed",
    );
    expect(view.limitationNotice.doesNotMean).toEqual([
      "bug-free",
      "secure",
      "legally compliant",
      "performant at scale",
      "aesthetically good",
    ]);
  });

  it("maps every overall verdict to a non-color-only label and icon", () => {
    const verdicts = [
      "ACCEPTED",
      "ACCEPTED_WITH_NOTES",
      "CHANGES_REQUIRED",
      "INSUFFICIENT_SPECIFICATION",
      "EXECUTION_INCOMPLETE",
    ] as const;

    for (const verdict of verdicts) {
      const view = buildReportView({ ...bundle, verdict });
      expect(view.verdict.value).toBe(verdict);
      expect(view.verdict.label.length).toBeGreaterThan(0);
      expect(view.verdict.icon.length).toBeGreaterThan(0);
      expect(view.verdict.description.length).toBeGreaterThan(0);
    }
  });
});
