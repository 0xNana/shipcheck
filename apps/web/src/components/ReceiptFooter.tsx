import type { ReceiptVerificationResponse } from "@shipcheck/service-core";

export function ReceiptFooter({
  receiptId,
  receiptHash,
  target,
  testedAt,
  verification,
}: {
  readonly receiptId: string;
  readonly receiptHash: string;
  readonly target: string;
  readonly testedAt: string;
  readonly verification: ReceiptVerificationResponse | null;
}) {
  return (
    <section aria-labelledby="receipt-heading" className="receipt">
      <h2 id="receipt-heading">Receipt</h2>
      <dl className="receipt__meta">
        <div>
          <dt>Receipt ID</dt>
          <dd>
            <code>{receiptId}</code>
          </dd>
        </div>
        <div>
          <dt>Receipt hash</dt>
          <dd>
            <code aria-label="Receipt hash">{receiptHash}</code>
          </dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>
            <a href={target} rel="noreferrer noopener">
              {target}
            </a>
          </dd>
        </div>
        <div>
          <dt>Tested at</dt>
          <dd>
            <time dateTime={testedAt}>{testedAt}</time>
          </dd>
        </div>
        <div>
          <dt>Integrity</dt>
          <dd aria-live="polite">
            {verification === null
              ? "Verification unavailable"
              : verification.valid
                ? "Receipt hash verified"
                : "Receipt hash verification failed"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
