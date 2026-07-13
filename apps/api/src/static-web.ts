import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import express, { type Express, type RequestHandler } from "express";

function resolveWebDistRoot(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(moduleDir, "../../web/dist"),
    join(moduleDir, "../../../web/dist"),
    join(process.cwd(), "apps/web/dist"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "index.html"))) {
      return candidate;
    }
  }
  throw new Error("Unable to locate apps/web/dist; build the web app first");
}

export interface StaticWebOptions {
  readonly distRoot?: string;
}

export function createStaticWebMiddleware(
  options: StaticWebOptions = {},
): RequestHandler {
  const distRoot = options.distRoot ?? resolveWebDistRoot();
  return express.static(distRoot, {
    index: false,
    fallthrough: true,
    maxAge: "1h",
  });
}

export function createSpaFallbackMiddleware(
  options: StaticWebOptions = {},
): RequestHandler {
  const distRoot = options.distRoot ?? resolveWebDistRoot();
  return (_request, response) => {
    response.sendFile(join(distRoot, "index.html"));
  };
}

export function mountStaticWeb(app: Express, options: StaticWebOptions = {}): void {
  app.use(createStaticWebMiddleware(options));
  app.use(createSpaFallbackMiddleware(options));
}
