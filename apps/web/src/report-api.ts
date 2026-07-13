import type {
  EvidenceLinkResponse,
  ReceiptVerificationResponse,
  ReportBundleResponse,
} from "@shipcheck/service-core";

import { fetchJson } from "./api.js";

export function fetchReportBundle(
  receiptId: string,
): Promise<ReportBundleResponse> {
  return fetchJson<ReportBundleResponse>(
    `/v1/reports/${encodeURIComponent(receiptId)}`,
  );
}

export function fetchReceiptVerification(
  receiptId: string,
): Promise<ReceiptVerificationResponse> {
  return fetchJson<ReceiptVerificationResponse>(
    `/v1/receipts/${encodeURIComponent(receiptId)}/verify`,
  );
}

export function fetchEvidenceLink(
  receiptId: string,
  evidenceId: string,
): Promise<EvidenceLinkResponse> {
  return fetchJson<EvidenceLinkResponse>(
    `/v1/reports/${encodeURIComponent(receiptId)}/evidence/${encodeURIComponent(evidenceId)}/link`,
  );
}

export const DEMO_RECEIPT_ID =
  import.meta.env.VITE_DEMO_RECEIPT_ID ?? "demo";
