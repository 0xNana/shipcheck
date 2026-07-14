import { useId, useState, type FormEvent } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/u, "") ||
  "https://shipcheck.up.railway.app";

const DEFAULT_BRIEF =
  "Build a responsive launch page with pricing and a waitlist form.";
const DEFAULT_URL = "https://example.com";

type OutputMode = "prompt" | "curl";

function buildBody(brief: string, deliveryUrl: string, maxRequirements: number) {
  return {
    brief: brief.trim(),
    deliveryUrl: deliveryUrl.trim(),
    mode: "quick" as const,
    maxRequirements,
  };
}

function buildAgentPrompt(
  brief: string,
  deliveryUrl: string,
  maxRequirements: number,
): string {
  const body = buildBody(brief, deliveryUrl, maxRequirements);
  return `Call ShipCheck to verify this delivery.

POST ${API_BASE}/v1/verify
Content-Type: application/json

${JSON.stringify(body, null, 2)}

If the response is HTTP 402, pay with OKX x402 / Agentic Wallet, then
replay the same request. When you get HTTP 200, open reportUrl and tell me
the verdict, summary counts, and any failed requirements.`;
}

function buildCurl(
  brief: string,
  deliveryUrl: string,
  maxRequirements: number,
): string {
  const body = buildBody(brief, deliveryUrl, maxRequirements);
  const compact = JSON.stringify(body);
  const shellSafe = compact.replace(/'/gu, `'\\''`);
  return `# Unpaid — expect HTTP 402 + payment-required (x402)
curl -i -X POST '${API_BASE}/v1/verify' \\
  -H 'content-type: application/json' \\
  -d '${shellSafe}'

# After paying with an x402-capable client, replay the same POST.
# Expect HTTP 200 with verdict, receipt, and reportUrl.`;
}

function validateInputs(brief: string, deliveryUrl: string): string | null {
  const trimmedBrief = brief.trim();
  const trimmedUrl = deliveryUrl.trim();
  if (trimmedBrief.length < 10) {
    return "Brief must be at least 10 characters.";
  }
  if (trimmedBrief.length > 12_000) {
    return "Brief must be at most 12 000 characters.";
  }
  try {
    const url = new URL(trimmedUrl);
    if (url.protocol !== "https:") {
      return "deliveryUrl must be a public https:// URL.";
    }
  } catch {
    return "deliveryUrl must be a valid https:// URL.";
  }
  return null;
}

export function VerifyHowto() {
  const formId = useId();
  const briefId = `${formId}-brief`;
  const urlId = `${formId}-url`;
  const maxId = `${formId}-max`;

  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [deliveryUrl, setDeliveryUrl] = useState(DEFAULT_URL);
  const [maxRequirements, setMaxRequirements] = useState(12);
  const [mode, setMode] = useState<OutputMode>("prompt");
  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState(false);

  const error = validateInputs(brief, deliveryUrl);
  const output =
    mode === "prompt"
      ? buildAgentPrompt(brief, deliveryUrl, maxRequirements)
      : buildCurl(brief, deliveryUrl, maxRequirements);

  async function copyOutput(): Promise<void> {
    if (error !== null) {
      setTouched(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setTouched(true);
    if (error === null) {
      void copyOutput();
    }
  }

  return (
    <div className="verify-howto">
      <p className="endpoint-line">
        <span className="endpoint-line__label">Production</span>
        <code>{API_BASE}</code>
        <span className="endpoint-line__sep">·</span>
        <code>POST /v1/verify</code>
        <span className="endpoint-line__sep">·</span>
        <span>0.01 USDT · x402</span>
      </p>

      <form className="verify-form" onSubmit={onSubmit} noValidate>
        <div className="verify-form__fields">
          <label className="verify-field" htmlFor={briefId}>
            <span className="verify-field__label">
              Brief
              <span className="verify-field__hint">original task text</span>
            </span>
            <textarea
              id={briefId}
              name="brief"
              rows={4}
              value={brief}
              onChange={(event) => {
                setBrief(event.target.value);
                setCopied(false);
              }}
              onBlur={() => setTouched(true)}
              spellCheck
              required
              minLength={10}
              maxLength={12_000}
            />
          </label>

          <div className="verify-form__row">
            <label className="verify-field" htmlFor={urlId}>
              <span className="verify-field__label">
                Delivery URL
                <span className="verify-field__hint">public https:// only</span>
              </span>
              <input
                id={urlId}
                name="deliveryUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://"
                value={deliveryUrl}
                onChange={(event) => {
                  setDeliveryUrl(event.target.value);
                  setCopied(false);
                }}
                onBlur={() => setTouched(true)}
                required
              />
            </label>

            <label className="verify-field verify-field--compact" htmlFor={maxId}>
              <span className="verify-field__label">
                Max reqs
                <span className="verify-field__hint">1–12</span>
              </span>
              <input
                id={maxId}
                name="maxRequirements"
                type="number"
                min={1}
                max={12}
                step={1}
                value={maxRequirements}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setMaxRequirements(
                    Number.isFinite(next)
                      ? Math.min(12, Math.max(1, Math.round(next)))
                      : 12,
                  );
                  setCopied(false);
                }}
              />
            </label>
          </div>
        </div>

        {touched && error !== null ? (
          <p className="verify-form__error" role="alert">
            {error}
          </p>
        ) : null}

        <div
          className="verify-output-tabs"
          role="tablist"
          aria-label="Generated request format"
        >
          <button
            type="button"
            role="tab"
            id={`${formId}-tab-prompt`}
            aria-selected={mode === "prompt"}
            aria-controls={`${formId}-panel`}
            className={
              mode === "prompt"
                ? "verify-tab verify-tab--active"
                : "verify-tab"
            }
            onClick={() => {
              setMode("prompt");
              setCopied(false);
            }}
          >
            Agent prompt
          </button>
          <button
            type="button"
            role="tab"
            id={`${formId}-tab-curl`}
            aria-selected={mode === "curl"}
            aria-controls={`${formId}-panel`}
            className={
              mode === "curl" ? "verify-tab verify-tab--active" : "verify-tab"
            }
            onClick={() => {
              setMode("curl");
              setCopied(false);
            }}
          >
            curl
          </button>
        </div>

        <div
          className="verify-output"
          role="tabpanel"
          id={`${formId}-panel`}
          aria-labelledby={
            mode === "prompt" ? `${formId}-tab-prompt` : `${formId}-tab-curl`
          }
        >
          <div className="verify-output__toolbar">
            <p className="verify-output__caption">
              {mode === "prompt"
                ? "Paste into Claude Code, Cursor, Codex, Hermes, or an Agentic Wallet client."
                : "For operators with an HTTP client and an x402 payer."}
            </p>
            <button
              type="button"
              className="verify-copy"
              onClick={() => {
                void copyOutput();
              }}
              disabled={error !== null}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="code-panel code-panel--interactive">
            <code
              aria-label={
                mode === "prompt"
                  ? "Generated agent prompt for ShipCheck verify"
                  : "Generated curl for ShipCheck verify"
              }
            >
              {output}
            </code>
          </pre>
        </div>

        <div className="verify-form__actions">
          <button type="submit" className="cta">
            {mode === "prompt" ? "Copy agent prompt" : "Copy curl"}
          </button>
          <a
            className="cta cta--ghost"
            href={`${API_BASE}/health/ready`}
            target="_blank"
            rel="noreferrer"
          >
            Check API health
          </a>
        </div>
      </form>

      <ol className="how-steps how-steps--compact">
        <li className="how-step">
          <span className="how-step__index" aria-hidden="true">
            01
          </span>
          <div>
            <h3>Edit the fields</h3>
            <p>
              Brief + public HTTPS delivery URL. Mode stays{" "}
              <code>quick</code>.
            </p>
          </div>
        </li>
        <li className="how-step">
          <span className="how-step__index" aria-hidden="true">
            02
          </span>
          <div>
            <h3>Copy prompt or curl</h3>
            <p>
              Switch tabs above. Paste into your agent, or run curl yourself.
            </p>
          </div>
        </li>
        <li className="how-step">
          <span className="how-step__index" aria-hidden="true">
            03
          </span>
          <div>
            <h3>Pay on 402, then open reportUrl</h3>
            <p>
              Unpaid calls return Payment Required. After a paid 200, read the
              verdict from the unlisted report.
            </p>
          </div>
        </li>
      </ol>
    </div>
  );
}
