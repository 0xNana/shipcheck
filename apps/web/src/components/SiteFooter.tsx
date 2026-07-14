import { Link } from "react-router-dom";

import { DEMO_RECEIPT_ID } from "../report-api.js";

export function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="Site">
      <div className="site-footer__grid">
        <div className="site-footer__brand">
          <p className="site-footer__name">ShipCheck</p>
          <p className="site-footer__tagline">
            Completion is a claim. Acceptance requires evidence.
          </p>
        </div>

        <nav className="site-footer__col" aria-labelledby="footer-product">
          <h2 id="footer-product">Product</h2>
          <ul>
            <li>
              <a href="/#howto">How to</a>
            </li>
            <li>
              <a href="/#traits">Traits</a>
            </li>
            <li>
              <a href="/#scope">Scope</a>
            </li>
            <li>
              <Link
                to={`/reports/${encodeURIComponent(DEMO_RECEIPT_ID)}`}
                aria-label="Open the demo acceptance report"
              >
                Demo report
              </Link>
            </li>
          </ul>
        </nav>

        <nav className="site-footer__col" aria-labelledby="footer-api">
          <h2 id="footer-api">API</h2>
          <ul>
            <li>
              <code>POST /v1/verify</code>
            </li>
            <li>
              <code>GET /v1/reports/:id</code>
            </li>
            <li>
              <code>GET /health</code>
            </li>
          </ul>
        </nav>

        <div className="site-footer__col" aria-labelledby="footer-limits">
          <h2 id="footer-limits">Limits</h2>
          <p>
            Functional acceptance is not a security audit, bug-free guarantee,
            or aesthetic review.
          </p>
        </div>
      </div>

      <div className="site-footer__bar">
        <p>Independent acceptance for agent-built software.</p>
        <p className="site-footer__meta">x402 · public web · V1</p>
      </div>
    </footer>
  );
}
