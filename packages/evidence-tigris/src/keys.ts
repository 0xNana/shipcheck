export function evidenceObjectKey(
  evidenceId: string,
  keyPrefix = "evidence",
): string {
  if (!/^ev_[a-f0-9]{24}$/u.test(evidenceId)) {
    throw new TypeError(`Invalid evidence ID: ${evidenceId}`);
  }
  return `${keyPrefix}/${evidenceId}`;
}

export function parseEvidenceObjectKey(
  objectKey: string,
  keyPrefix = "evidence",
): string | undefined {
  const prefix = `${keyPrefix}/`;
  if (!objectKey.startsWith(prefix)) {
    return undefined;
  }
  const evidenceId = objectKey.slice(prefix.length);
  return /^ev_[a-f0-9]{24}$/u.test(evidenceId) ? evidenceId : undefined;
}
