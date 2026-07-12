import { describe, expect, it } from "vitest";

import {
  UrlPolicyError,
  createFixtureUrlGuard,
  createProductionUrlGuard,
  type AddressResolver,
} from "../src/index.js";

const publicResolver: AddressResolver = () =>
  Promise.resolve([
    { address: "93.184.216.34", family: 4 },
    { address: "2606:4700:4700::1111", family: 6 },
  ]);

describe("production URL guard", () => {
  it("normalizes HTTPS URLs and international hostnames", async () => {
    const guard = createProductionUrlGuard(publicResolver);

    const result = await guard.validate("https://BÜCHER.example:443/a/../docs?q=1");

    expect(result.normalizedUrl).toBe(
      "https://xn--bcher-kva.example/docs?q=1",
    );
    expect(result.hostname).toBe("xn--bcher-kva.example");
    expect(result.addresses).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
  });

  it.each([
    "http://example.com",
    "file:///etc/passwd",
    "ftp://example.com/file",
    "javascript:alert(1)",
    "https://example.com:444/",
    "https://user:pass@example.com/",
  ])("rejects disallowed URL %s", async (rawUrl) => {
    const guard = createProductionUrlGuard(publicResolver);

    await expect(guard.validate(rawUrl)).rejects.toBeInstanceOf(UrlPolicyError);
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ])("rejects a hostname when DNS includes blocked address %s", async (address) => {
    const family = address.includes(":") ? 6 : 4;
    const resolver: AddressResolver = () =>
      Promise.resolve([{ address, family }]);
    const guard = createProductionUrlGuard(resolver);

    await expect(guard.validate("https://example.com")).rejects.toMatchObject({
      code: "BLOCKED_ADDRESS",
    });
  });

  it("rejects the whole destination when one of several DNS answers is blocked", async () => {
    const resolver: AddressResolver = () =>
      Promise.resolve([
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]);

    await expect(
      createProductionUrlGuard(resolver).validate("https://example.com"),
    ).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
  });

  it("resolves on every validation to catch rebinding and redirect changes", async () => {
    let resolution = 0;
    const resolver: AddressResolver = () => {
      resolution += 1;
      return Promise.resolve(
        resolution === 1
          ? [{ address: "93.184.216.34", family: 4 }]
          : [{ address: "169.254.169.254", family: 4 }],
      );
    };
    const guard = createProductionUrlGuard(resolver);

    await expect(guard.validate("https://example.com/start")).resolves.toMatchObject({
      hostname: "example.com",
    });
    await expect(
      guard.validateRedirect("https://example.com/start", "/next"),
    ).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
  });

  it("rejects IP literals and empty or failed DNS answers", async () => {
    const emptyResolver: AddressResolver = () => Promise.resolve([]);
    const failedResolver: AddressResolver = () =>
      Promise.reject(new Error("resolver details must not escape"));

    await expect(
      createProductionUrlGuard(publicResolver).validate("https://93.184.216.34"),
    ).rejects.toMatchObject({ code: "IP_LITERAL_NOT_ALLOWED" });
    await expect(
      createProductionUrlGuard(emptyResolver).validate("https://example.com"),
    ).rejects.toMatchObject({ code: "DNS_RESOLUTION_FAILED" });
    await expect(
      createProductionUrlGuard(failedResolver).validate("https://example.com"),
    ).rejects.toMatchObject({
      code: "DNS_RESOLUTION_FAILED",
      message: "Destination hostname could not be resolved",
    });
  });
});

describe("fixture URL guard", () => {
  it("allows only explicit HTTP loopback literals for local adapter tests", async () => {
    const guard = createFixtureUrlGuard();

    await expect(
      guard.validate("http://127.0.0.1:43123/complete"),
    ).resolves.toMatchObject({ hostname: "127.0.0.1" });
    await expect(guard.validate("http://localhost:43123/")).rejects.toMatchObject({
      code: "FIXTURE_URL_NOT_ALLOWED",
    });
    await expect(guard.validate("http://10.0.0.1:43123/")).rejects.toMatchObject({
      code: "FIXTURE_URL_NOT_ALLOWED",
    });
    await expect(guard.validate("https://example.com/")).rejects.toMatchObject({
      code: "FIXTURE_URL_NOT_ALLOWED",
    });
  });
});
