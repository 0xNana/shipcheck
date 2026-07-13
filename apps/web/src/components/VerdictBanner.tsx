import type { ReportViewVerdict, VerdictIcon } from "@shipcheck/report-view";

const ICON_GLYPH: Record<VerdictIcon, string> = {
  accepted: "✓",
  accepted_with_notes: "✓*",
  changes_required: "!",
  insufficient_specification: "?",
  execution_incomplete: "…",
};

export function VerdictBanner({
  verdict,
}: {
  readonly verdict: ReportViewVerdict;
}) {
  return (
    <section
      className={`verdict verdict--${verdict.icon}`}
      aria-labelledby="verdict-heading"
    >
      <div className="verdict__icon" aria-hidden="true">
        {ICON_GLYPH[verdict.icon]}
      </div>
      <div>
        <p className="eyebrow">Overall verdict</p>
        <h1 id="verdict-heading">
          <span className="verdict__label">{verdict.label}</span>
          <span className="verdict__code"> ({verdict.value})</span>
        </h1>
        <p className="verdict__description">{verdict.description}</p>
      </div>
    </section>
  );
}
