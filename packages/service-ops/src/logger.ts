const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERN =
  /(?:api[_-]?key|secret|passphrase|authorization|payment|x402|brief|form(?:value|values)?|pagecontent|rawcontent|signed(?:evidence)?url|storageurl|password|token|credential|cookie|private[_-]?key)/iu;

const BEARER_PATTERN = /^Bearer\s+\S+/iu;
const SIGNED_URL_PATTERN =
  /(?:X-Amz-Signature|X-Amz-Credential|Signature=|sig=|token=)/iu;

const ALLOWED_LOG_FIELDS = new Set([
  "level",
  "message",
  "timestamp",
  "requestId",
  "receiptId",
  "contractId",
  "stage",
  "errorCode",
  "method",
  "path",
  "statusCode",
  "durationMs",
  "route",
  "paid",
  "verdict",
  "compilerVersion",
  "policyVersion",
  "executionPolicyVersion",
  "adapterVersion",
  "event",
  "ready",
  "checks",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shouldRedactKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function shouldRedactValue(value: string): boolean {
  return (
    BEARER_PATTERN.test(value) ||
    SIGNED_URL_PATTERN.test(value) ||
    value.length > 512
  );
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return REDACTED;
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return shouldRedactValue(value) ? REDACTED : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, depth + 1));
  }
  if (!isPlainObject(value)) {
    return REDACTED;
  }
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = shouldRedactKey(key)
      ? REDACTED
      : redactValue(entry, depth + 1);
  }
  return output;
}

export function sanitizeLogFields(
  fields: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_LOG_FIELDS.has(key)) {
      continue;
    }
    output[key] = redactValue(value);
  }
  return output;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogger {
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface StructuredLoggerOptions {
  readonly now?: () => string;
  readonly sink?: (line: string) => void;
}

export function createStructuredLogger(
  options: StructuredLoggerOptions = {},
): StructuredLogger {
  const now = options.now ?? (() => new Date().toISOString());
  const sink = options.sink ?? ((line: string) => process.stdout.write(`${line}\n`));

  const write = (
    level: LogLevel,
    message: string,
    fields: Record<string, unknown> = {},
  ): void => {
    const payload = sanitizeLogFields({
      level,
      message,
      timestamp: now(),
      ...fields,
    });
    sink(JSON.stringify(payload));
  };

  return {
    log: write,
    debug(message, fields) {
      write("debug", message, fields);
    },
    info(message, fields) {
      write("info", message, fields);
    },
    warn(message, fields) {
      write("warn", message, fields);
    },
    error(message, fields) {
      write("error", message, fields);
    },
  };
}
