import type { ExecutionPolicy } from "@shipcheck/execution-planner";
import { describe, expect, it, vi } from "vitest";

const launch = vi.hoisted(() => {
  let resolveBrowser: ((browser: { close: () => Promise<void> }) => void) | undefined;
  const promise = new Promise<{ close: () => Promise<void> }>((resolve) => {
    resolveBrowser = resolve;
  });
  return {
    run: vi.fn(() => promise),
    resolve(browser: { close: () => Promise<void> }) {
      resolveBrowser?.(browser);
    },
  };
});

vi.mock("playwright-core", () => ({
  chromium: { launch: launch.run },
}));

import { createPublicWebWorker } from "../src/index.js";

const policy: ExecutionPolicy = {
  policyVersion: "execution-v1",
  allowedSchemes: ["https"],
  allowedPorts: [443],
  maxRedirects: 5,
  maxPages: 3,
  maxPopups: 1,
  desktopViewport: { width: 1440, height: 900 },
  mobileViewport: { width: 375, height: 812 },
  maxRequirements: 12,
  maxExecutableRequirementsQuick: 8,
  blockedActionClasses: [],
  captureTraceOn: ["FAIL", "EXECUTION_ERROR"],
  sameOriginNetworkFailureThreshold: 400,
};

describe("public-web worker cancellation", () => {
  it("closes a browser that finishes launching after abort without leaking rejection", async () => {
    const close = vi.fn(() => Promise.reject(new Error("close failed")));
    const controller = new AbortController();
    const worker = createPublicWebWorker({
      executablePath: "/usr/bin/google-chrome",
      policy,
      urlGuard: {
        validate: () =>
          Promise.resolve({
            normalizedUrl: "https://example.com/",
            hostname: "example.com",
            addresses: [{ address: "93.184.216.34", family: 4 }],
          }),
        validateRedirect: () =>
          Promise.reject(new Error("Redirect not expected")),
      },
    });

    const execution = worker.execute({
      target: "https://example.com/",
      checks: [],
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(launch.run).toHaveBeenCalledOnce();
    });
    controller.abort(new Error("time budget exceeded"));

    await expect(execution).resolves.toMatchObject({
      executionStatus: "INCOMPLETE",
    });
    launch.resolve({ close });
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledOnce();
    });
  });
});
