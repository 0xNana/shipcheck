import { Link } from "react-router-dom";

import { SiteFooter } from "../components/SiteFooter.js";
import { DEMO_RECEIPT_ID } from "../report-api.js";

const API_SNIPPET = `// 1. Ask ShipCheck to verify a public delivery.
curl -X POST "$SHIPCHECK_URL/v1/verify" \\
  -H 'content-type: application/json' \\
  -d '{
    "brief": "Build a responsive launch page with pricing and a waitlist form.",
    "deliveryUrl": "https://example.com",
    "mode": "quick",
    "maxRequirements": 12
  }'

// 2. Without payment proof the API returns HTTP 402 (x402).
// 3. Replay with payment, then open reportUrl for the human report.`;

const TRAITS = [
  {
    title: "Deterministic",
    body: "The model compiles requirements. A versioned policy awards the verdict.",
  },
  {
    title: "Evidence-backed",
    body: "Independent browser observations, screenshots, and traces — not caller claims.",
  },
  {
    title: "Bounded",
    body: "Public HTTPS pages only. Finite checks, wall-clock limits, no destructive actions.",
  },
  {
    title: "Agent-ready",
    body: "Typed receipt, structured failures, and an unlisted report URL per run.",
  },
] as const;

const IN_SCOPE = [
  "Required text, sections, and page elements",
  "Internal links and CTA destinations",
  "Basic non-destructive form submission",
  "Desktop and mobile navigation",
  "Overflow, assets, console errors, same-origin failures",
  "HTTPS, title/metadata, basic accessibility signals",
] as const;

const OUT_OF_SCOPE = [
  "Authentication, payments, and wallets",
  "Destructive actions and CAPTCHA bypass",
  "Penetration testing or security audits",
  "Aesthetic judgment and native mobile apps",
] as const;

export function LandingPage() {
  return (
    <div className="shell">
      <header className="topbar">
        <a className="topbar__brand" href="#top" aria-label="ShipCheck home">
          ShipCheck
        </a>
        <nav className="topbar__nav" aria-label="Primary">
          <a href="#overview">Overview</a>
          <a href="#traits">Traits</a>
          <a href="#scope">Scope</a>
          <Link
            to={`/reports/${encodeURIComponent(DEMO_RECEIPT_ID)}`}
            aria-label="Open the demo acceptance report"
          >
            Demo
          </Link>
        </nav>
      </header>

      <main id="top" className="page landing">
        <section className="landing__hero" aria-labelledby="hero-heading">
          <p className="brand" aria-hidden="true">
            ShipCheck
          </p>
          <p className="category">Agent Acceptance Layer</p>
          <h1 id="hero-heading">
            Your agent says it’s done.
            <span className="hero-question"> Is it verifiable?</span>
          </h1>
          <p className="lede">
            ShipCheck converts the original brief into executable requirements,
            tests the delivered product, and produces evidence for every result.
          </p>
          <p className="hero-tagline">Do not trust “done.” Verify it.</p>
          <div className="cta-row">
            <Link
              className="cta"
              to={`/reports/${encodeURIComponent(DEMO_RECEIPT_ID)}`}
              aria-label="Verify a delivery — open the demo acceptance report"
            >
              Verify a delivery
            </Link>
            <a className="cta cta--ghost" href="#overview">
              Run ShipCheck
            </a>
          </div>
        </section>

        <aside className="verify-boundary" aria-label="Verification boundary">
          <p>
            <strong>What ShipCheck verifies:</strong> whether supported,
            objectively testable requirements were observed in the submitted
            delivery at the recorded time.
          </p>
          <p>
            ShipCheck does not guarantee that software is bug-free, secure, or
            compliant beyond the requirements and checks shown in the receipt.
          </p>
        </aside>

        <section
          id="overview"
          aria-labelledby="overview-heading"
          className="landing__section"
        >
          <div className="section-head">
            <h2 id="overview-heading">Overview</h2>
            <p>One paid call. A typed receipt. An unlisted human report.</p>
          </div>
          <pre className="code-panel">
            <code aria-label="Example POST /v1/verify request">{API_SNIPPET}</code>
          </pre>
        </section>

        <section
          id="traits"
          aria-labelledby="traits-heading"
          className="landing__section"
        >
          <div className="section-head">
            <h2 id="traits-heading">Traits</h2>
            <p>Built for coding agents that need proof, not polish.</p>
          </div>
          <ul className="trait-grid">
            {TRAITS.map((trait) => (
              <li key={trait.title} className="trait">
                <h3>{trait.title}</h3>
                <p>{trait.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="scope"
          aria-labelledby="scope-heading"
          className="landing__section"
        >
          <div className="section-head">
            <h2 id="scope-heading">Bounded public-web scope</h2>
            <p>
              V1 verifies public, unauthenticated landing pages and simple
              public web flows.
            </p>
          </div>
          <div className="scope-split">
            <div>
              <h3>In scope</h3>
              <ul className="scope-list">
                {IN_SCOPE.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Out of scope</h3>
              <ul className="scope-list scope-list--muted">
                {OUT_OF_SCOPE.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
