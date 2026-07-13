import {
  AcceptanceReceiptSchema,
  EvidenceManifestSchema,
  type AcceptanceReceipt,
  type EvidenceArtifact,
  type EvidenceManifest,
} from "@shipcheck/domain";

import { buildEvidenceManifest } from "./evidence-manifest.js";
import {
  buildAcceptanceReceipt,
  type BuildAcceptanceReceiptInput,
} from "./receipt-builder.js";

export interface AcceptanceBundle {
  readonly receipt: AcceptanceReceipt;
  readonly evidenceManifest: EvidenceManifest;
}

export function buildAcceptanceBundle(
  input: BuildAcceptanceReceiptInput,
): AcceptanceBundle {
  const evidenceManifest = buildEvidenceManifest(input.artifacts);
  const receipt = buildAcceptanceReceipt(input);
  return {
    receipt: AcceptanceReceiptSchema.parse(receipt),
    evidenceManifest: EvidenceManifestSchema.parse(evidenceManifest),
  };
}

export function buildAcceptanceBundleFromArtifacts(
  input: Omit<BuildAcceptanceReceiptInput, "artifacts"> & {
    readonly artifacts: readonly EvidenceArtifact[];
  },
): AcceptanceBundle {
  return buildAcceptanceBundle(input);
}
