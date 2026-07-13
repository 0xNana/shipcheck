import type { ReportViewSummary } from "@shipcheck/report-view";

const COUNTS: ReadonlyArray<{
  readonly key: keyof ReportViewSummary;
  readonly label: string;
}> = [
  { key: "total", label: "Total" },
  { key: "passed", label: "Passed" },
  { key: "failed", label: "Failed" },
  { key: "unverified", label: "Unverified" },
  { key: "notObjectivelyTestable", label: "Not objectively testable" },
  { key: "unsupported", label: "Unsupported" },
];

export function SummaryCounts({
  summary,
}: {
  readonly summary: ReportViewSummary;
}) {
  return (
    <section aria-labelledby="summary-heading" className="summary">
      <h2 id="summary-heading">Requirement summary</h2>
      <ul className="summary__list" aria-label="Requirement result counts">
        {COUNTS.map(({ key, label }) => (
          <li key={key} className="summary__item">
            <span className="summary__label">{label}</span>
            <span className="summary__value" aria-label={`${label}: ${String(summary[key])}`}>
              {summary[key]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
