import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createCorsMiddleware,
  createHealthHandlers,
  createMetricsAuthMiddleware,
  createRequestTelemetryMiddleware,
  createShipCheckMetrics,
  createStructuredLogger,
  parseCorsAllowedOrigins,
  renderMetrics,
} from "../src/index.js";

describe("health handlers", () => {
  it("returns legacy, live, and ready responses", async () => {
    const app = express();
    const health = createHealthHandlers({
      configReady: () => true,
      postgres: {
        ping() {
          return Promise.resolve();
        },
      },
    });
    app.get("/health", health.legacyHealth);
    app.get("/health/live", health.live);
    app.get("/health/ready", health.ready);

    await expect(request(app).get("/health")).resolves.toMatchObject({
      status: 200,
      body: { status: "ok" },
    });
    await expect(request(app).get("/health/live")).resolves.toMatchObject({
      status: 200,
      body: { status: "live" },
    });
    await expect(request(app).get("/health/ready")).resolves.toMatchObject({
      status: 200,
      body: {
        status: "ready",
        checks: { config: true, postgres: true },
      },
    });
  });

  it("marks readiness unavailable when postgres ping fails", async () => {
    const app = express();
    const health = createHealthHandlers({
      configReady: () => true,
      postgres: {
        ping() {
          return Promise.reject(new Error("db down"));
        },
      },
    });
    app.get("/health/ready", health.ready);

    await expect(request(app).get("/health/ready")).resolves.toMatchObject({
      status: 503,
      body: {
        status: "not_ready",
        checks: { config: true, postgres: false },
      },
    });
  });
});

describe("cors middleware", () => {
  it("parses comma-separated allowed origins", () => {
    expect(
      parseCorsAllowedOrigins(
        "https://shipcheck-web.vercel.app, https://shipcheck.up.railway.app",
      ),
    ).toEqual([
      "https://shipcheck-web.vercel.app",
      "https://shipcheck.up.railway.app",
    ]);
  });

  it("reflects allowed origins and handles preflight", async () => {
    const app = express();
    app.use(
      createCorsMiddleware(["https://shipcheck-web.vercel.app"]),
    );
    app.get("/v1/reports/demo", (_request, response) => {
      response.json({ ok: true });
    });

    await expect(
      request(app)
        .get("/v1/reports/demo")
        .set("Origin", "https://shipcheck-web.vercel.app"),
    ).resolves.toMatchObject({
      status: 200,
      headers: {
        "access-control-allow-origin": "https://shipcheck-web.vercel.app",
      },
    });

    await expect(
      request(app)
        .options("/v1/reports/demo")
        .set("Origin", "https://shipcheck-web.vercel.app"),
    ).resolves.toMatchObject({ status: 204 });
  });
});

describe("metrics middleware", () => {
  it("protects /metrics with bearer token", async () => {
    const app = express();
    const metrics = createShipCheckMetrics({ collectProcessMetrics: false });
    app.get(
      "/metrics",
      createMetricsAuthMiddleware("metrics-token"),
      async (_request, response) => {
        response.set("Content-Type", metrics.registry.contentType);
        response.send(await renderMetrics(metrics));
      },
    );

    await expect(request(app).get("/metrics")).resolves.toMatchObject({
      status: 401,
    });
    await expect(
      request(app)
        .get("/metrics")
        .set("Authorization", "Bearer metrics-token"),
    ).resolves.toMatchObject({ status: 200 });
  });

  it("records request metrics and structured logs", async () => {
    const app = express();
    const metrics = createShipCheckMetrics({ collectProcessMetrics: false });
    const lines: string[] = [];
    const logger = createStructuredLogger({ sink: (line) => lines.push(line) });
    app.use(createRequestTelemetryMiddleware({ logger, metrics }));
    app.get("/v1/reports/:receiptId", (_request, response) => {
      response.status(200).json({ ok: true });
    });

    await request(app).get("/v1/reports/receipt_123");
    const rendered = await renderMetrics(metrics);
    expect(rendered).toContain("shipcheck_http_requests_total");
    expect(lines.some((line) => line.includes("request.completed"))).toBe(true);
  });
});
