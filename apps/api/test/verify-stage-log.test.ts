import { describe, expect, it, vi } from "vitest";

import {
  createVerifyStageLogger,
  safeUrlForStageLog,
} from "../src/verify-stage-log.js";

describe("verify stage logging", () => {
  it("emits requestId, stage, and elapsedMs through the structured logger", () => {
    const lines: Array<Record<string, unknown>> = [];
    const logger = {
      log: vi.fn(
        (
          _level: string,
          message: string,
          fields: Record<string, unknown> = {},
        ) => {
          lines.push({ message, ...fields });
        },
      ),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const stages = createVerifyStageLogger({
      requestId: "sc_req_stage",
      startedAt: Date.now() - 25,
      logger,
    });

    stages.logStage("compiler_started");
    stages.logStage("compiler_completed", { requirementCount: 3 });
    stages.logFailure(new Error("boom"));

    expect(logger.log).toHaveBeenCalledTimes(3);
    expect(lines[0]).toMatchObject({
      message: "verify.stage",
      requestId: "sc_req_stage",
      stage: "compiler_started",
    });
    expect(typeof lines[0]?.["elapsedMs"]).toBe("number");
    expect(lines[1]).toMatchObject({
      stage: "compiler_completed",
      requirementCount: 3,
    });
    expect(lines[2]).toMatchObject({
      stage: "verification_failed",
      error: "boom",
    });
  });

  it("strips query strings from urls before logging", () => {
    expect(
      safeUrlForStageLog(
        "https://example.com/path?X-Amz-Signature=abc&token=1",
      ),
    ).toBe("https://example.com/path");
  });
});
