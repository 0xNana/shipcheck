import type { RequestHandler } from "express";

import type { StructuredLogger } from "./logger.js";
import type { ShipCheckMetrics } from "./metrics.js";

function normalizeRoute(path: string): string {
  return path
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu,
      "/:id",
    )
    .replace(/\/receipt_[a-z0-9]+/giu, "/:receiptId")
    .replace(/\/req_[a-z0-9]+/giu, "/:requestId")
    .replace(/\/ev_[a-z0-9]+/giu, "/:evidenceId");
}

export interface RequestTelemetryOptions {
  readonly logger: StructuredLogger;
  readonly metrics: ShipCheckMetrics;
  readonly paidRouteMatcher?: (method: string, path: string) => boolean;
}

export function createRequestTelemetryMiddleware(
  options: RequestTelemetryOptions,
): RequestHandler {
  const paidRouteMatcher =
    options.paidRouteMatcher ??
    ((method, path) => method === "POST" && path === "/v1/verify");

  return (request, response, next) => {
    const startedAt = Date.now();
    response.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const route = normalizeRoute(request.path);
      const paid = paidRouteMatcher(request.method, request.path);
      options.metrics.recordHttpRequest({
        method: request.method,
        route,
        statusCode: response.statusCode,
        durationMs,
        paid,
      });
      options.logger.info("request.completed", {
        method: request.method,
        path: route,
        statusCode: response.statusCode,
        durationMs,
        paid,
        requestId:
          typeof response.locals["requestId"] === "string"
            ? response.locals["requestId"]
            : undefined,
      });
    });
    next();
  };
}

export function createMetricsAuthMiddleware(
  bearerToken: string | undefined,
): RequestHandler {
  return (request, response, next) => {
    if (bearerToken === undefined || bearerToken.length === 0) {
      response.status(503).json({
        error: {
          code: "EXECUTION_UNAVAILABLE",
          message: "Metrics endpoint is not configured",
        },
      });
      return;
    }
    const header = request.get("Authorization");
    if (header !== `Bearer ${bearerToken}`) {
      response.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Metrics bearer token is required",
        },
      });
      return;
    }
    next();
  };
}

const originPattern = /^https?:\/\/[^\s/]+(?::\d+)?$/u;

export function parseCorsAllowedOrigins(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim().length === 0) {
    return [];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function createCorsMiddleware(
  allowedOrigins: readonly string[],
): RequestHandler {
  const allowed = new Set(
    allowedOrigins.filter((origin) => originPattern.test(origin)),
  );

  return (request, response, next) => {
    if (allowed.size === 0) {
      next();
      return;
    }

    const origin = request.get("Origin");
    if (origin !== undefined && allowed.has(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Idempotency-Key, payment-signature, x-payment",
      );
      response.setHeader("Access-Control-Max-Age", "86400");
    }

    if (request.method === "OPTIONS") {
      response.sendStatus(origin !== undefined && allowed.has(origin) ? 204 : 403);
      return;
    }

    next();
  };
}
