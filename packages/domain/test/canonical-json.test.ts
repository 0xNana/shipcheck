import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  hashAcceptanceContract,
  sha256Canonical,
} from "../src/index.js";

describe("canonicalJson", () => {
  it("sorts object keys recursively and preserves array order", () => {
    expect(
      canonicalJson({ z: 1, nested: { b: true, a: null }, list: [3, 1, 2] }),
    ).toBe('{"list":[3,1,2],"nested":{"a":null,"b":true},"z":1}');
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-JSON input %s",
    (value) => {
      expect(() => canonicalJson(value)).toThrow();
    },
  );

  it("rejects symbol-keyed properties instead of silently dropping them", () => {
    expect(() =>
      canonicalJson({ visible: true, [Symbol("hidden")]: "not JSON" }),
    ).toThrow();
  });
});

describe("sha256Canonical", () => {
  it("matches a stable golden digest", () => {
    expect(sha256Canonical({ b: 2, a: 1 })).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
  });
});

describe("hashAcceptanceContract", () => {
  it("omits the self-referential contractHash field", () => {
    const contract = {
      schemaVersion: "shipcheck-acceptance-contract-v1.0.0",
      contractId: "contract_1",
      contractHash: "a".repeat(64),
    };

    expect(hashAcceptanceContract(contract)).toBe(
      sha256Canonical({
        schemaVersion: "shipcheck-acceptance-contract-v1.0.0",
        contractId: "contract_1",
      }),
    );
  });
});
