import {
  sanitizeLogFields,
  type StructuredLogger,
} from "@shipcheck/service-ops";

export interface VerifyStageLogger {
  logStage(stage: string, extra?: Record<string, unknown>): void;
  logFailure(error: unknown): void;
}

export function createVerifyStageLogger(options: {
  readonly requestId: string;
  readonly startedAt: number;
  readonly logger?: StructuredLogger | undefined;
}): VerifyStageLogger {
  const logStage = (
    stage: string,
    extra: Record<string, unknown> = {},
  ): void => {
    const fields = {
      requestId: options.requestId,
      stage,
      elapsedMs: Date.now() - options.startedAt,
      ...extra,
    };
    if (options.logger !== undefined) {
      const level = stage.endsWith("_failed") ? "error" : "info";
      options.logger.log(level, "verify.stage", fields);
      return;
    }
    // Fallback for tests / early boot — still scrub sensitive keys.
    console.log(
      sanitizeLogFields({
        message: "verify.stage",
        ...fields,
      }),
    );
  };

  return {
    logStage,
    logFailure(error: unknown): void {
      logStage("verification_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    },
  };
}

/** Strip query/hash so logs never carry signed evidence or payment query params. */
export function safeUrlForStageLog(raw: string): string {
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}
