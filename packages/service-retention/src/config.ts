export interface RetentionWindows {
  readonly requestRetentionDays: number;
  readonly receiptRetentionDays: number;
  readonly evidenceRetentionDays: number;
}

export const DEFAULT_RETENTION_WINDOWS: RetentionWindows = {
  requestRetentionDays: 30,
  receiptRetentionDays: 30,
  evidenceRetentionDays: 7,
};

export function retentionWindowsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RetentionWindows {
  return {
    requestRetentionDays: parsePositiveInt(
      env["REQUEST_RETENTION_DAYS"],
      DEFAULT_RETENTION_WINDOWS.requestRetentionDays,
    ),
    receiptRetentionDays: parsePositiveInt(
      env["RECEIPT_RETENTION_DAYS"],
      DEFAULT_RETENTION_WINDOWS.receiptRetentionDays,
    ),
    evidenceRetentionDays: parsePositiveInt(
      env["EVIDENCE_RETENTION_DAYS"],
      DEFAULT_RETENTION_WINDOWS.evidenceRetentionDays,
    ),
  };
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new TypeError(`Expected a positive integer, received ${value}`);
  }
  return parsed;
}

export function subtractDays(instant: Date, days: number): Date {
  const result = new Date(instant.getTime());
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}
