import type {
  EvidenceArtifact,
  OverallVerdict,
  RequirementResult,
} from "@shipcheck/domain";
import type { ReportBundleResponse } from "@shipcheck/service-core";

export type EvidenceType = EvidenceArtifact["type"];
export type RequirementResultStatus = RequirementResult["status"];

export type VerdictIcon =
  | "accepted"
  | "accepted_with_notes"
  | "changes_required"
  | "insufficient_specification"
  | "execution_incomplete";

export interface ReportViewVerdict {
  readonly value: OverallVerdict;
  readonly label: string;
  readonly icon: VerdictIcon;
  readonly description: string;
}

export interface ReportViewSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly unverified: number;
  readonly notObjectivelyTestable: number;
  readonly unsupported: number;
}

export interface ReportViewRequirement {
  readonly requirementId: string;
  readonly statement: string;
  readonly priority: string;
  readonly status: RequirementResultStatus;
  readonly statusLabel: string;
  readonly expected?: string;
  readonly observed?: string;
  readonly repairHint?: string;
  readonly evidenceIds: readonly string[];
  readonly rerunEligible: boolean;
}

export interface ReportViewEvidence {
  readonly evidenceId: string;
  readonly type: EvidenceType;
  readonly typeLabel: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface ReportViewLimitationNotice {
  readonly acceptedMeans: string;
  readonly doesNotMean: readonly string[];
}

export interface ReportView {
  readonly receiptId: string;
  readonly verdict: ReportViewVerdict;
  readonly summary: ReportViewSummary;
  readonly requirements: readonly ReportViewRequirement[];
  readonly evidence: readonly ReportViewEvidence[];
  readonly receiptHash: string;
  readonly target: string;
  readonly testedAt: string;
  readonly createdAt: string;
  readonly limitationNotice: ReportViewLimitationNotice;
}

const VERDICT_META: Record<
  OverallVerdict,
  Omit<ReportViewVerdict, "value">
> = {
  ACCEPTED: {
    label: "Accepted",
    icon: "accepted",
    description:
      "All critical and required acceptance checks passed under the referenced policy.",
  },
  ACCEPTED_WITH_NOTES: {
    label: "Accepted with notes",
    icon: "accepted_with_notes",
    description:
      "Acceptance passed with non-blocking notes such as optional gaps or clarifications.",
  },
  CHANGES_REQUIRED: {
    label: "Changes required",
    icon: "changes_required",
    description:
      "One or more critical or required acceptance checks failed.",
  },
  INSUFFICIENT_SPECIFICATION: {
    label: "Insufficient specification",
    icon: "insufficient_specification",
    description:
      "The brief could not be turned into enough objective acceptance checks.",
  },
  EXECUTION_INCOMPLETE: {
    label: "Execution incomplete",
    icon: "execution_incomplete",
    description:
      "Verification could not finish safely, so no acceptance claim is made.",
  },
};

function statusLabel(status: RequirementResultStatus): string {
  switch (status) {
    case "PASS":
      return "Pass";
    case "FAIL":
      return "Fail";
    case "UNVERIFIED":
      return "Unverified";
    case "NOT_OBJECTIVELY_TESTABLE":
      return "Not objectively testable";
    case "UNSUPPORTED":
      return "Unsupported";
  }
}

function evidenceTypeLabel(type: EvidenceType): string {
  switch (type) {
    case "SCREENSHOT":
      return "Screenshot";
    case "ELEMENT_SCREENSHOT":
      return "Element screenshot";
    case "TRACE":
      return "Trace";
    case "DOM_EXCERPT":
      return "DOM excerpt";
    case "ACCESSIBILITY_SNAPSHOT":
      return "Accessibility snapshot";
    case "HTTP_RECORD":
      return "HTTP record";
    case "NETWORK_RECORD":
      return "Network record";
    case "CONSOLE_RECORD":
      return "Console record";
    case "TARGET_FINGERPRINT":
      return "Target fingerprint";
  }
}

export const LIMITATION_NOTICE: ReportViewLimitationNotice = {
  acceptedMeans:
    "Under the referenced specification, adapter capabilities, evidence, and policy version, no critical or required acceptance failure was observed.",
  doesNotMean: [
    "bug-free",
    "secure",
    "legally compliant",
    "performant at scale",
    "aesthetically good",
  ],
};

export function buildReportView(bundle: ReportBundleResponse): ReportView {
  const statements = new Map(
    bundle.contract.requirements.map((requirement) => [
      requirement.id,
      requirement.statement,
    ]),
  );

  const requirements: ReportViewRequirement[] = bundle.results.map((result) => {
    const row: ReportViewRequirement = {
      requirementId: result.requirementId,
      statement:
        statements.get(result.requirementId) ?? result.requirementId,
      priority: result.priority,
      status: result.status,
      statusLabel: statusLabel(result.status),
      evidenceIds: result.evidenceIds,
      rerunEligible: result.rerunEligible,
      ...(result.expected === undefined ? {} : { expected: result.expected }),
      ...(result.observed === undefined ? {} : { observed: result.observed }),
      ...(result.repairHint === undefined
        ? {}
        : { repairHint: result.repairHint }),
    };
    return row;
  });

  const evidence: ReportViewEvidence[] = bundle.evidenceManifest.artifacts.map(
    (artifact) => ({
      evidenceId: artifact.id,
      type: artifact.type,
      typeLabel: evidenceTypeLabel(artifact.type),
      contentType: artifact.contentType,
      sizeBytes: artifact.sizeBytes,
    }),
  );

  const meta = VERDICT_META[bundle.verdict];

  return {
    receiptId: bundle.receiptId,
    verdict: {
      value: bundle.verdict,
      label: meta.label,
      icon: meta.icon,
      description: meta.description,
    },
    summary: bundle.summary,
    requirements,
    evidence,
    receiptHash: bundle.receipt.receiptHash,
    target: bundle.receipt.target,
    testedAt: bundle.receipt.testedAt,
    createdAt: bundle.createdAt,
    limitationNotice: LIMITATION_NOTICE,
  };
}
