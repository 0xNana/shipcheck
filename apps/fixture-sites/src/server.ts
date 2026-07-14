import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_PATHS = [
  "/complete",
  "/demo",
  "/missing-pricing",
  "/docs-404",
  "/waitlist-500",
  "/waitlist-no-confirmation",
  "/mobile-overflow",
  "/broken-image",
  "/console-error",
  "/redirect-private",
  "/redirect-loop-a",
  "/destructive-form",
  "/popup-storm",
  "/slow",
] as const;

export interface RunningFixtureServer {
  readonly origin: string;
  url(path: string): string;
  close(): Promise<void>;
}

interface PageOptions {
  readonly includePricing?: boolean;
  readonly docsHref?: string;
  readonly waitlistAction?: string;
  readonly suppressConfirmation?: boolean;
  readonly overflow?: boolean;
  readonly brokenImage?: boolean;
  readonly consoleError?: boolean;
  readonly destructiveForm?: boolean;
  readonly popupStorm?: boolean;
}

function page(options: PageOptions = {}): string {
  const includePricing = options.includePricing ?? true;
  const docsHref = options.docsHref ?? "/docs";
  const waitlistAction = options.waitlistAction ?? "/api/waitlist";
  const submitScript = options.suppressConfirmation
    ? "event.preventDefault();"
    : `event.preventDefault();fetch(event.currentTarget.action,{method:'POST',body:new FormData(event.currentTarget)}).then(async(response)=>{if(response.ok){document.querySelector('[role=status]').textContent='You are on the waitlist.';}});`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A deterministic ShipCheck fixture page.">
  <title>ShipCheck Fixture</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;padding:2rem;max-width:72rem}
    nav,a,button,input{margin:.25rem}
    ${options.overflow === true ? "@media(max-width:500px){main{width:200vw}}" : ""}
  </style>
</head>
<body>
  <header><nav aria-label="Primary"><a href="/complete">Home</a><a href="${docsHref}">Documentation</a></nav></header>
  <main>
    <h1>Launch your product with confidence</h1>
    <p>Objective evidence for every delivery requirement.</p>
    ${includePricing ? '<section id="pricing" aria-labelledby="pricing-title"><h2 id="pricing-title">Pricing</h2><p>Quick verification: $9.</p></section>' : ""}
    <section aria-labelledby="waitlist-title">
      <h2 id="waitlist-title">Join the waitlist</h2>
      <form action="${waitlistAction}" method="post" onsubmit="${submitScript}">
        <label>Email <input name="email" type="email" required></label>
        <button type="submit">Join waitlist</button>
      </form>
      <p role="status" aria-live="polite"></p>
    </section>
    <img src="${options.brokenImage === true ? "/assets/missing.png" : "/assets/ok.svg"}" alt="ShipCheck fixture mark">
    ${options.destructiveForm === true ? '<form action="/api/delete-account" method="post"><button type="submit">Delete account permanently</button></form>' : ""}
    ${options.popupStorm === true ? '<button id="popup" type="button" onclick="window.open(\'/popup-one\');window.open(\'/popup-two\');window.open(\'/popup-three\')">Open resources</button>' : ""}
  </main>
  ${options.consoleError === true ? '<script>queueMicrotask(()=>{throw new Error("fixture console failure")})</script>' : ""}
</body>
</html>`;
}

function send(
  response: ServerResponse,
  status: number,
  body: string,
  contentType = "text/html; charset=utf-8",
  headers: Readonly<Record<string, string>> = {},
): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": contentType,
    ...headers,
  });
  response.end(body);
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://fixture.invalid");
  switch (url.pathname) {
    case "/complete":
    case "/docs":
    case "/popup-one":
    case "/popup-two":
    case "/popup-three":
      send(response, 200, page());
      return;
    case "/missing-pricing":
      send(response, 200, page({ includePricing: false }));
      return;
    case "/demo":
      send(
        response,
        200,
        page({
          includePricing: false,
          waitlistAction: "/api/waitlist-failure",
          overflow: true,
        }),
      );
      return;
    case "/docs-404":
      send(response, 200, page({ docsHref: "/missing-docs" }));
      return;
    case "/waitlist-500":
      send(response, 200, page({ waitlistAction: "/api/waitlist-failure" }));
      return;
    case "/waitlist-no-confirmation":
      send(response, 200, page({ suppressConfirmation: true }));
      return;
    case "/mobile-overflow":
      send(response, 200, page({ overflow: true }));
      return;
    case "/broken-image":
      send(response, 200, page({ brokenImage: true }));
      return;
    case "/console-error":
      send(response, 200, page({ consoleError: true }));
      return;
    case "/destructive-form":
      send(response, 200, page({ destructiveForm: true }));
      return;
    case "/popup-storm":
      send(response, 200, page({ popupStorm: true }));
      return;
    case "/slow":
      send(response, 200, page({ waitlistAction: "/api/slow" }));
      return;
    case "/redirect-private":
      send(response, 302, "Redirecting", "text/html; charset=utf-8", {
        location: "http://169.254.169.254/latest/meta-data/",
      });
      return;
    case "/redirect-loop-a":
      send(response, 302, "Redirecting", "text/html; charset=utf-8", {
        location: "/redirect-loop-b",
      });
      return;
    case "/redirect-loop-b":
      send(response, 302, "Redirecting", "text/html; charset=utf-8", {
        location: "/redirect-loop-a",
      });
      return;
    case "/missing-docs":
    case "/assets/missing.png":
      send(response, 404, "Not found", "text/plain; charset=utf-8");
      return;
    case "/assets/ok.svg":
      send(
        response,
        200,
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="green"/></svg>',
        "image/svg+xml",
      );
      return;
    case "/api/waitlist":
      send(response, 200, JSON.stringify({ accepted: true }), "application/json");
      return;
    case "/api/waitlist-failure":
      send(response, 500, JSON.stringify({ accepted: false }), "application/json");
      return;
    case "/api/delete-account":
      send(response, 409, "Blocked fixture action", "text/plain; charset=utf-8");
      return;
    case "/api/slow":
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 30_000);
        request.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      if (!response.destroyed) {
        send(response, 200, JSON.stringify({ accepted: true }), "application/json");
      }
      return;
    default:
      send(response, 404, "Not found", "text/plain; charset=utf-8");
  }
}

export interface StartFixtureServerOptions {
  /** Serve HTTPS with the bundled loopback dev certificate (for local demo/API compile). */
  readonly https?: boolean;
}

const DEV_CERT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../dev-certs");

async function createFixtureListener(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  options: StartFixtureServerOptions,
) {
  if (options.https === true) {
    const [key, cert] = await Promise.all([
      readFile(join(DEV_CERT_DIR, "fixture.key")),
      readFile(join(DEV_CERT_DIR, "fixture.crt")),
    ]);
    return createHttpsServer({ key, cert }, handler);
  }
  return createServer(handler);
}

export async function startFixtureServer(
  options: StartFixtureServerOptions = {},
): Promise<RunningFixtureServer> {
  const protocol = options.https === true ? "https" : "http";
  const server = await createFixtureListener((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent) {
        send(response, 500, "Fixture failure", "text/plain; charset=utf-8");
      } else {
        response.destroy();
      }
    });
  }, options);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new TypeError("Fixture server did not bind a TCP port");
  }

  const origin = `${protocol}://127.0.0.1:${String(address.port)}`;
  let closed = false;
  return {
    origin,
    url(path: string): string {
      return new URL(path, origin).toString();
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      server.close();
      await once(server, "close");
    },
  };
}
