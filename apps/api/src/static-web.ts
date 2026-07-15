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

/** API / ops paths must never be swallowed by the marketing SPA. */
export function isApiOrOpsPath(pathname: string): boolean {
  return (
    pathname === "/metrics" ||
    pathname === "/health" ||
    pathname.startsWith("/health/") ||
    pathname === "/v1" ||
    pathname.startsWith("/v1/")
  );
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
  return (request, response, next) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      next();
      return;
    }
    if (isApiOrOpsPath(request.path)) {
      response.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "No such API route for this method",
        },
      });
      return;
    }
    response.sendFile(join(distRoot, "index.html"));
  };
}

export function mountStaticWeb(app: Express, options: StaticWebOptions = {}): void {
  app.use(createStaticWebMiddleware(options));
  app.use(createSpaFallbackMiddleware(options));
}
