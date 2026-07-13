import { Link } from "react-router-dom";

import { DEMO_RECEIPT_ID } from "../report-api.js";

const API_SNIPPET = `curl -X POST https://api.shipcheck.example/v1/verify \\
  -H 'content-type: application/json' \\
  -d '{
    "brief": "Build a responsive launch page with pricing, FAQ, documentation and a working waitlist form.",
    "deliveryUrl": "https://example.com",
    "mode": "quick",
    "maxRequirements": 12
  }'`;

export function LandingPage() {
  return (
    <main className="page landing">
      <header className="landing__hero">
        <p className="brand" aria-label="ShipCheck">
          ShipCheck
        </p>
        <h1>Agents claim completion. ShipCheck produces acceptance.</h1>
        <p className="lede">
          Convert a natural-language public-web delivery brief into executable
          acceptance checks, then return an evidence-backed verdict and receipt.
        </p>
        <p>
          <Link
            className="cta"
            to={`/reports/${encodeURIComponent(DEMO_RECEIPT_ID)}`}
            aria-label="Open the demo acceptance report"
          >
            View demo report
          </Link>
        </p>
      </header>

      <section aria-labelledby="scope-heading" className="landing__section">
        <h2 id="scope-heading">Bounded public-web scope</h2>
        <p>
          V1 verifies public, unauthenticated landing pages and simple public
          web flows. Checks cover required text and sections, link resolution,
          CTA destinations, basic non-destructive forms, navigation, overflow,
          assets, console errors, same-origin failures, HTTPS, metadata, and
          basic accessibility signals.
        </p>
        <p>
          Authenticated apps, payments, destructive actions, penetration
          testing, native mobile, complex multi-user workflows, aesthetic
          judgment, arbitrary code execution, and CAPTCHA bypass are out of
          scope.
        </p>
      </section>

      <section aria-labelledby="api-heading" className="landing__section">
        <h2 id="api-heading">API usage</h2>
        <p>
          Call the paid quick-acceptance endpoint, then open the returned{" "}
          <code>reportUrl</code> for the human-readable report.
        </p>
        <pre>
          <code aria-label="Example POST /v1/verify request">{API_SNIPPET}</code>
        </pre>
      </section>
    </main>
  );
}
