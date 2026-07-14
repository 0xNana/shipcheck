import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";

import { SiteFooter } from "../components/SiteFooter.js";
import { VerifyHowto } from "../components/VerifyHowto.js";
import { DEMO_RECEIPT_ID } from "../report-api.js";

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

function howtoHashOpen(): boolean {
  return typeof window !== "undefined" && window.location.hash === "#howto";
}

export function LandingPage() {
  const howtoPanelId = useId();
  const [howtoOpen, setHowtoOpen] = useState(howtoHashOpen);

  useEffect(() => {
    function openFromHash(): void {
      if (window.location.hash === "#howto") {
        setHowtoOpen(true);
      }
    }

    function openFromHowtoLink(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const link = target.closest('a[href="#howto"]');
      if (link !== null) {
        setHowtoOpen(true);
      }
    }

    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    document.addEventListener("click", openFromHowtoLink);
    return () => {
      window.removeEventListener("hashchange", openFromHash);
      document.removeEventListener("click", openFromHowtoLink);
    };
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <a className="topbar__brand" href="#top" aria-label="ShipCheck home">
          ShipCheck
        </a>
        <nav className="topbar__nav" aria-label="Primary">
          <a href="#howto">How to</a>
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
            <a className="cta cta--ghost" href="#howto">
              How to run a verify
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
          id="howto"
          aria-labelledby="howto-heading"
          className={
            howtoOpen
              ? "landing__section howto-section howto-section--open"
              : "landing__section howto-section"
          }
        >
          <button
            type="button"
            className="howto-toggle"
            aria-expanded={howtoOpen}
            aria-controls={howtoPanelId}
            onClick={() => {
              setHowtoOpen((current) => !current);
            }}
          >
            <span className="howto-toggle__copy">
              <h2 id="howto-heading">How to run a verify</h2>
              <p>
                Fill the form — it builds a live agent prompt or curl for you.
                Copy, paste, pay on 402, then open the report.
              </p>
            </span>
            <span className="howto-toggle__icon" aria-hidden="true">
              {howtoOpen ? "−" : "+"}
            </span>
          </button>
          {howtoOpen ? (
            <div id={howtoPanelId} className="howto-panel">
              <VerifyHowto />
            </div>
          ) : null}
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
