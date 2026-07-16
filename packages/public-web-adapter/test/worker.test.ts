import { startFixtureServer, type RunningFixtureServer } from "@shipcheck/fixture-sites";
import { PlannedCheckSchema, type ExecutionPolicy, type PlannedCheck } from "@shipcheck/execution-planner";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFixtureUrlGuard, createPublicWebWorker } from "../src/index.js";

const policy: ExecutionPolicy = {
  policyVersion: "shipcheck-public-web-v1.0.0",
  allowedSchemes: ["https"], allowedPorts: [443], maxRedirects: 5,
  maxPages: 3, maxPopups: 1,
  desktopViewport: { width: 1440, height: 900 },
  mobileViewport: { width: 375, height: 812 },
  maxRequirements: 12, maxExecutableRequirementsQuick: 8,
  blockedActionClasses: ["AUTHENTICATION", "PAYMENT", "WALLET", "DESTRUCTIVE", "FILE_UPLOAD", "PERMISSION_GRANT", "DOWNLOAD_EXECUTABLE"],
  captureTraceOn: ["FAIL", "EXECUTION_ERROR"],
  sameOriginNetworkFailureThreshold: 400,
};

function check(intent: PlannedCheck["intent"], parameters: PlannedCheck["parameters"], index: number): PlannedCheck {
  return PlannedCheckSchema.parse({
    checkId: `check_${String(index)}`, requirementId: `req_${String(index)}`,
    adapter: "PUBLIC_WEB", intent, parameters,
  });
}

let fixtures: RunningFixtureServer;
beforeAll(async () => { fixtures = await startFixtureServer(); });
afterAll(async () => { await fixtures.close(); });

describe("public-web worker", () => {
  it("reports the browser launch error when execution fails closed", async () => {
    const stages: Array<{ stage: string; error?: unknown }> = [];
    const worker = createPublicWebWorker({
      executablePath: "/definitely/missing/chromium",
      urlGuard: createFixtureUrlGuard(),
      policy,
    });

    const result = await worker.executeWithEvidence(
      {
        target: fixtures.url("/"),
        checks: [
          check("CONTENT_PRESENT", { semanticTarget: "anything" }, 99),
        ],
      },
      {
        artifactSink: {
          write: () => Promise.reject(new Error("No artifact expected")),
        },
        now: () => "2026-07-16T20:00:00.000Z",
        onStage: (stage, extra) => stages.push({ stage, ...extra }),
      },
    );

    expect(result.executionStatus).toBe("INCOMPLETE");
    const failure = stages.find(({ stage }) => stage === "browser_failed");
    expect(failure).toBeDefined();
    expect(typeof failure?.error).toBe("string");
    if (typeof failure?.error === "string") {
      expect(failure.error).toContain("executable doesn't exist");
    }
  });

  it("executes finite checks in an isolated Chromium context", async () => {
    const worker = createPublicWebWorker({
      executablePath: "/usr/bin/google-chrome", urlGuard: createFixtureUrlGuard(), policy,
      budgets: { runTimeoutMs: 10_000, navigationTimeoutMs: 3_000, actionTimeoutMs: 1_000 },
    });
    const checks = [
      check("SECTION_PRESENT", { semanticTarget: "Pricing" }, 1),
      check("FORM_ACCEPTS_INPUT", { semanticTarget: "Join the waitlist", inputProfile: "SAFE_TEST_EMAIL", successSignals: ["VISIBLE_CONFIRMATION", "SUCCESSFUL_SAME_ORIGIN_RESPONSE"] }, 2),
      check("ASSETS_LOAD", { requiredImagesOnly: true }, 3),
      check("NO_SEVERE_CONSOLE_ERRORS", { minimumLevel: "ERROR" }, 4),
      check("NO_HORIZONTAL_OVERFLOW", { viewports: ["DESKTOP", "MOBILE"], tolerancePixels: 1 }, 5),
      check("METADATA_PRESENT", { fields: ["TITLE", "DESCRIPTION"] }, 6),
      check("BASIC_ACCESSIBILITY", { checks: ["DOCUMENT_LANGUAGE", "PAGE_TITLE", "IMAGE_ALT", "FORM_LABELS"] }, 7),
    ];

    const result = await worker.execute({ target: fixtures.url("/complete"), checks });

    expect(result.executionStatus).toBe("COMPLETED");
    expect(result.results).toHaveLength(checks.length);
    expect(result.results.every(({ status }) => status === "SATISFIED")).toBe(true);
    expect(result.targetFingerprint.finalUrl).toBe(fixtures.url("/complete"));
    expect(result.targetFingerprint.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.contextClosed).toBe(true);
    expect(result.browserClosed).toBe(true);
  }, 15_000);

  it("reports objective contradictions without turning them into worker errors", async () => {
    const worker = createPublicWebWorker({ executablePath: "/usr/bin/google-chrome", urlGuard: createFixtureUrlGuard(), policy });
    const [missingSection, overflow, brokenImage, consoleError] = await Promise.all([
      worker.execute({ target: fixtures.url("/missing-pricing"), checks: [check("SECTION_PRESENT", { semanticTarget: "Pricing" }, 10)] }),
      worker.execute({ target: fixtures.url("/mobile-overflow"), checks: [check("NO_HORIZONTAL_OVERFLOW", { viewports: ["DESKTOP", "MOBILE"], tolerancePixels: 1 }, 11)] }),
      worker.execute({ target: fixtures.url("/broken-image"), checks: [check("ASSETS_LOAD", { requiredImagesOnly: true }, 12)] }),
      worker.execute({ target: fixtures.url("/console-error"), checks: [check("NO_SEVERE_CONSOLE_ERRORS", { minimumLevel: "ERROR" }, 13)] }),
    ]);

    for (const result of [missingSection, overflow, brokenImage, consoleError]) {
      expect(result.executionStatus).toBe("COMPLETED");
      expect(result.results[0]?.status).toBe("CONTRADICTED");
    }
  }, 20_000);

  it("fails closed for blocked actions, unsafe redirects, and timeouts", async () => {
    const worker = createPublicWebWorker({ executablePath: "/usr/bin/google-chrome", urlGuard: createFixtureUrlGuard(), policy });
    const timeoutWorker = createPublicWebWorker({
      executablePath: "/usr/bin/google-chrome",
      urlGuard: createFixtureUrlGuard(),
      policy,
      budgets: {
        runTimeoutMs: 500,
        navigationTimeoutMs: 100,
        actionTimeoutMs: 100,
      },
    });
    const [destructive, redirect, timeout] = await Promise.all([
      worker.execute({
        target: fixtures.url("/destructive-form"),
        checks: [check("FORM_ACCEPTS_INPUT", { semanticTarget: "Delete account permanently", inputProfile: "SAFE_TEST_EMAIL", successSignals: ["VISIBLE_CONFIRMATION", "SUCCESSFUL_SAME_ORIGIN_RESPONSE"] }, 20)],
      }),
      worker.execute({
        target: fixtures.url("/redirect-private"),
        checks: [check("CONTENT_PRESENT", { semanticTarget: "anything" }, 30)],
      }),
      timeoutWorker.execute({
        target: fixtures.url("/api/slow"),
        checks: [check("CONTENT_PRESENT", { semanticTarget: "anything" }, 31)],
      }),
    ]);

    expect(destructive.executionStatus).toBe("COMPLETED");
    expect(destructive.results[0]).toMatchObject({ status: "INCONCLUSIVE", facts: { actionBlocked: true } });
    expect(redirect.executionStatus).toBe("INCOMPLETE");
    expect(redirect.results[0]?.status).toBe("EXECUTION_ERROR");
    expect(redirect.blockedRequests).toBeGreaterThan(0);
    expect(timeout.executionStatus).toBe("INCOMPLETE");
    expect(timeout.results[0]?.status).toBe("EXECUTION_ERROR");
    for (const result of [destructive, redirect, timeout]) {
      expect(result.contextClosed).toBe(true);
      expect(result.browserClosed).toBe(true);
    }
  }, 20_000);
});
