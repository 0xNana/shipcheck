import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EvidenceArtifactSchema, ObservationSchema } from "@shipcheck/domain";
import { createArtifactSink, type EvidenceBlobWrite } from "@shipcheck/evidence-store";
import { PlannedCheckSchema, type ExecutionPolicy } from "@shipcheck/execution-planner";
import { startFixtureServer, type RunningFixtureServer } from "@shipcheck/fixture-sites";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFixtureUrlGuard, createPublicWebWorker, normalizeCheckResult } from "../src/index.js";

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

let fixtures: RunningFixtureServer;
beforeAll(async () => { fixtures = await startFixtureServer(); });
afterAll(async () => { await fixtures.close(); });

describe("observation normalization", () => {
  it.each([
    ["SATISFIED", "OBSERVED_TRUE"],
    ["CONTRADICTED", "OBSERVED_FALSE"],
    ["INCONCLUSIVE", "INCONCLUSIVE"],
    ["EXECUTION_ERROR", "EXECUTION_ERROR"],
  ] as const)("maps %s to %s", (status, expected) => {
    const observation = normalizeCheckResult(
      { checkId: "check_1", status, summary: "Observed result.", facts: {} },
      [],
      "2026-07-12T21:35:00Z",
    );
    expect(ObservationSchema.safeParse(observation).success).toBe(true);
    expect(observation.status).toBe(expected);
  });
});

describe("browser evidence capture", () => {
  it("captures failure screenshots and traces, normalizes observations, and removes temp files", async () => {
    const writes: EvidenceBlobWrite[] = [];
    const sink = createArtifactSink({
      put(input) { writes.push(input); return Promise.resolve({}); },
    });
    const tempRoot = await mkdtemp(join(tmpdir(), "shipcheck-evidence-test-"));
    const worker = createPublicWebWorker({
      executablePath: "/usr/bin/google-chrome", urlGuard: createFixtureUrlGuard(), policy,
    });
    const failingCheck = PlannedCheckSchema.parse({
      checkId: "check_missing_pricing", requirementId: "req_missing_pricing",
      adapter: "PUBLIC_WEB", intent: "SECTION_PRESENT",
      parameters: { semanticTarget: "Pricing" },
    });
    const passingCheck = PlannedCheckSchema.parse({
      checkId: "check_pricing", requirementId: "req_pricing",
      adapter: "PUBLIC_WEB", intent: "SECTION_PRESENT",
      parameters: { semanticTarget: "Pricing" },
    });

    try {
      const failure = await worker.executeWithEvidence(
        { target: fixtures.url("/missing-pricing"), checks: [failingCheck] },
        { artifactSink: sink, now: () => "2026-07-12T21:35:00Z", tempRoot },
      );
      const success = await worker.executeWithEvidence(
        { target: fixtures.url("/complete"), checks: [passingCheck] },
        { artifactSink: sink, now: () => "2026-07-12T21:35:01Z", tempRoot },
      );

      expect(failure.observations[0]).toMatchObject({ checkId: failingCheck.checkId, status: "OBSERVED_FALSE" });
      expect(failure.artifacts.map(({ type }) => type).sort()).toEqual(["SCREENSHOT", "TRACE"]);
      expect(failure.artifacts.every((artifact) => EvidenceArtifactSchema.safeParse(artifact).success)).toBe(true);
      expect(failure.observations[0]?.evidenceIds).toHaveLength(2);
      expect(success.observations[0]?.status).toBe("OBSERVED_TRUE");
      expect(success.artifacts).toEqual([]);
      expect(failure.temporaryFilesCleaned).toBe(true);
      expect(success.temporaryFilesCleaned).toBe(true);
      expect(await readdir(tempRoot)).toEqual([]);
      expect(writes.some(({ contentType, bytes }) => contentType === "image/png" && bytes[0] === 0x89 && bytes[1] === 0x50)).toBe(true);
      expect(writes.some(({ contentType, bytes }) => contentType === "application/zip" && bytes[0] === 0x50 && bytes[1] === 0x4b)).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 20_000);
});
