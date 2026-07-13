import type {
  ReportViewEvidence,
  ReportViewRequirement,
} from "@shipcheck/report-view";

export function RequirementRows({
  requirements,
  evidenceById,
  onOpenEvidence,
  openingEvidenceId,
}: {
  readonly requirements: readonly ReportViewRequirement[];
  readonly evidenceById: ReadonlyMap<string, ReportViewEvidence>;
  readonly onOpenEvidence: (evidenceId: string) => void;
  readonly openingEvidenceId: string | null;
}) {
  return (
    <section aria-labelledby="requirements-heading" className="requirements">
      <h2 id="requirements-heading">Requirements</h2>
      <ol className="requirements__list">
        {requirements.map((requirement) => (
          <li
            key={requirement.requirementId}
            className="requirement"
            aria-label={`${requirement.statusLabel}: ${requirement.statement}`}
          >
            <div className="requirement__header">
              <span
                className={`requirement__status requirement__status--${requirement.status.toLowerCase()}`}
                aria-label={`Status: ${requirement.statusLabel}`}
              >
                {requirement.statusLabel}
              </span>
              <span className="requirement__priority">
                {requirement.priority}
              </span>
            </div>
            <h3 className="requirement__statement">{requirement.statement}</h3>
            {requirement.expected !== undefined ? (
              <p>
                <strong>Expected:</strong> {requirement.expected}
              </p>
            ) : null}
            {requirement.observed !== undefined ? (
              <p>
                <strong>Observed:</strong> {requirement.observed}
              </p>
            ) : null}
            {requirement.repairHint !== undefined ? (
              <p>
                <strong>Repair hint:</strong> {requirement.repairHint}
              </p>
            ) : null}
            {requirement.evidenceIds.length > 0 ? (
              <ul
                className="requirement__evidence"
                aria-label={`Evidence for ${requirement.statement}`}
              >
                {requirement.evidenceIds.map((evidenceId) => {
                  const artifact = evidenceById.get(evidenceId);
                  const label = artifact?.typeLabel ?? evidenceId;
                  return (
                    <li key={evidenceId}>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => {
                          onOpenEvidence(evidenceId);
                        }}
                        aria-label={`Open evidence ${label}`}
                        disabled={openingEvidenceId === evidenceId}
                      >
                        {openingEvidenceId === evidenceId
                          ? "Opening…"
                          : label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
