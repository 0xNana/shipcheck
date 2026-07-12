import { afterEach, describe, expect, it } from "vitest";

import {
  FIXTURE_PATHS,
  startFixtureServer,
  type RunningFixtureServer,
} from "../src/index.js";

let running: RunningFixtureServer | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

describe("fixture sites", () => {
  it("serves every documented page from an ephemeral loopback origin", async () => {
    running = await startFixtureServer();

    expect(running.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    for (const path of FIXTURE_PATHS) {
      const response = await fetch(running.url(path), { redirect: "manual" });
      expect(response.status, path).toBeLessThan(500);
      expect(response.headers.get("content-type"), path).toContain("text/html");
    }
  });

  it("provides a complete page and a successful synthetic waitlist flow", async () => {
    running = await startFixtureServer();

    const page = await (await fetch(running.url("/complete"))).text();
    const submission = await fetch(running.url("/api/waitlist"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=shipcheck%2Bfixture%40example.test",
    });

    expect(page).toContain("<section id=\"pricing\"");
    expect(page).toContain("<form");
    expect(submission.status).toBe(200);
    await expect(submission.json()).resolves.toEqual({ accepted: true });
  });

  it("exposes deterministic missing, failed, and hostile scenarios", async () => {
    running = await startFixtureServer();

    const missingPricing = await (
      await fetch(running.url("/missing-pricing"))
    ).text();
    const missingDocs = await fetch(running.url("/missing-docs"));
    const waitlistFailure = await fetch(running.url("/api/waitlist-failure"), {
      method: "POST",
    });
    const privateRedirect = await fetch(running.url("/redirect-private"), {
      redirect: "manual",
    });
    const redirectLoop = await fetch(running.url("/redirect-loop-a"), {
      redirect: "manual",
    });

    expect(missingPricing).not.toContain("id=\"pricing\"");
    expect(missingDocs.status).toBe(404);
    expect(waitlistFailure.status).toBe(500);
    expect(privateRedirect.headers.get("location")).toBe(
      "http://169.254.169.254/latest/meta-data/",
    );
    expect(redirectLoop.headers.get("location")).toBe("/redirect-loop-b");
  });

  it("closes without leaving the listener reachable", async () => {
    running = await startFixtureServer();
    const url = running.url("/complete");

    await running.close();
    running = undefined;

    await expect(fetch(url)).rejects.toThrow();
  });
});
