import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createSpaFallbackMiddleware,
  isApiOrOpsPath,
  mountStaticWeb,
} from "../src/static-web.js";

describe("static web mounting", () => {
  it("classifies API and ops paths", () => {
    expect(isApiOrOpsPath("/v1/verify")).toBe(true);
    expect(isApiOrOpsPath("/health/ready")).toBe(true);
    expect(isApiOrOpsPath("/metrics")).toBe(true);
    expect(isApiOrOpsPath("/reports/demo")).toBe(false);
  });

  it("does not serve the SPA HTML for GET /v1/verify", async () => {
    const distRoot = await mkdtemp(join(tmpdir(), "shipcheck-web-"));
    await writeFile(
      join(distRoot, "index.html"),
      "<!doctype html><title>ShipCheck</title>",
      "utf8",
    );

    const app = express();
    app.get("/v1/compile", (_request, response) => {
      response.json({ ok: true });
    });
    mountStaticWeb(app, { distRoot });

    const apiMiss = await request(app).get("/v1/verify").expect(404);
    expect(apiMiss.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "No such API route for this method",
      },
    });
    expect(apiMiss.headers["content-type"]).toMatch(/json/u);

    await request(app)
      .get("/reports/demo")
      .expect(200)
      .expect("Content-Type", /html/u);
  });

  it("leaves non-GET methods alone for the SPA fallback", async () => {
    const distRoot = await mkdtemp(join(tmpdir(), "shipcheck-web-"));
    await writeFile(join(distRoot, "index.html"), "<html></html>", "utf8");

    const app = express();
    app.post("/v1/verify", (_request, response) => {
      response.status(402).json({ x402Version: 2 });
    });
    app.use(createSpaFallbackMiddleware({ distRoot }));

    await request(app).post("/v1/verify").expect(402);
  });
});
