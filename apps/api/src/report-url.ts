export function buildReportUrl(baseUrl: string, receiptId: string): string {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    `reports/${encodeURIComponent(receiptId)}`,
    normalized,
  ).toString();
}
