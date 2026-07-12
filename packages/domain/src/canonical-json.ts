import { createHash } from "node:crypto";

type JsonObject = { readonly [key: string]: JsonValue };
type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | JsonObject;

function normalize(value: unknown, seen: WeakSet<object>): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON only accepts finite numbers");
    }
    return value;
  }

  if (typeof value !== "object") {
    throw new TypeError("Canonical JSON only accepts JSON values");
  }

  if (seen.has(value)) {
    throw new TypeError("Canonical JSON does not accept cyclic values");
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalize(item, seen));
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON only accepts plain objects");
    }

    const source = value as Record<string, unknown>;
    if (Object.getOwnPropertySymbols(source).length > 0) {
      throw new TypeError("Canonical JSON does not accept symbol-keyed values");
    }
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      result[key] = normalize(source[key], seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, new WeakSet()));
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function omitKeys(
  value: Readonly<Record<string, unknown>>,
  omittedKeys: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !omittedKeys.has(key)),
  );
}

export function hashAcceptanceContract(
  contract: Readonly<Record<string, unknown>>,
): string {
  return sha256Canonical(omitKeys(contract, new Set(["contractHash"])));
}

export function hashAcceptanceReceipt(
  receipt: Readonly<Record<string, unknown>>,
): string {
  return sha256Canonical(
    omitKeys(receipt, new Set(["receiptHash", "signature", "anchor"])),
  );
}

export function hashEvidenceManifest(
  artifacts: readonly Readonly<Record<string, unknown>>[],
): string {
  const immutableArtifacts = artifacts
    .map((artifact) => omitKeys(artifact, new Set(["storageUrl"])))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  return sha256Canonical(immutableArtifacts);
}
