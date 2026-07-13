import type { ReportViewLimitationNotice } from "@shipcheck/report-view";

export function LimitationNotice({
  notice,
}: {
  readonly notice: ReportViewLimitationNotice;
}) {
  return (
    <aside
      className="limitation"
      aria-labelledby="limitation-heading"
    >
      <h2 id="limitation-heading">Acceptance limitation</h2>
      <p>{notice.acceptedMeans}</p>
      <p>It does not mean the target is:</p>
      <ul>
        {notice.doesNotMean.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </aside>
  );
}
