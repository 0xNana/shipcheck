import { describe, expect, it } from "vitest";

import {
  createStructuredLogger,
  incidentGatesFromEnv,
  parseBooleanEnv,
  redactValue,
  sanitizeLogFields,
} from "../src/index.js";

describe("redactValue", () => {
  it("redacts sensitive keys recursively", () => {
    const redacted = redactValue({
      requestId: "req_1",
      apiKey: "secret-key",
      headers: {
        Authorization: "Bearer abc.def.ghi",
        "x-payment-signature": "signed",
      },
      brief: "Full delivery brief text",
      nested: {
        formValues: { email: "user@example.com" },
        pageContent: "<html>...</html>",
      },
      evidence: {
        signedEvidenceUrl:
          "https://storage.example/evidence?X-Amz-Signature=abc123",
      },
    });

    expect(redacted).toEqual({
      requestId: "req_1",
      apiKey: "[REDACTED]",
      headers: {
        Authorization: "[REDACTED]",
        "x-payment-signature": "[REDACTED]",
      },
      brief: "[REDACTED]",
      nested: {
        formValues: "[REDACTED]",
        pageContent: "[REDACTED]",
      },
      evidence: {
        signedEvidenceUrl: "[REDACTED]",
      },
    });
  });

  it("redacts long strings and bearer tokens in values", () => {
    expect(redactValue("Bearer super-secret")).toBe("[REDACTED]");
    expect(redactValue("x".repeat(600))).toBe("[REDACTED]");
  });
});

describe("sanitizeLogFields", () => {
  it("keeps only allowlisted fields", () => {
    expect(
      sanitizeLogFields({
        requestId: "req_1",
        apiKey: "secret",
        secretField: "hidden",
        stage: "verify",
      }),
    ).toEqual({
      requestId: "req_1",
      stage: "verify",
    });
  });
});

describe("createStructuredLogger", () => {
  it("writes JSON with redacted fields", () => {
    const lines: string[] = [];
    const logger = createStructuredLogger({
      now: () => "2026-07-12T00:00:00.000Z",
      sink: (line) => lines.push(line),
    });

    logger.info("verify.started", {
      requestId: "req_1",
      brief: "secret brief",
      stage: "verify",
    });

    expect(JSON.parse(lines[0] ?? "{}")).toEqual({
      level: "info",
      message: "verify.started",
      timestamp: "2026-07-12T00:00:00.000Z",
      requestId: "req_1",
      stage: "verify",
    });
  });
});

describe("incident gates", () => {
  it("defaults gates to enabled", () => {
    expect(incidentGatesFromEnv({})).toEqual({
      verificationEnabled: true,
      browserExecutionEnabled: true,
    });
  });

  it("parses explicit disable flags", () => {
    expect(
      incidentGatesFromEnv({
        VERIFICATION_ENABLED: "false",
        BROWSER_EXECUTION_ENABLED: "0",
      }),
    ).toEqual({
      verificationEnabled: false,
      browserExecutionEnabled: false,
    });
  });

  it("rejects invalid boolean env values", () => {
    expect(() => parseBooleanEnv("maybe", true)).toThrow(
      /boolean env value/i,
    );
  });
});
