import { describe, expect, it } from "vitest";

import { loadApiConfig } from "../src/config.js";

const requiredEnv = {
  PUBLIC_BASE_URL: "https://shipcheck.example",
  OPENAI_API_KEY: "sk-test",
  REQUIREMENT_COMPILER_MODEL: "gpt-4.1-mini",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/shipcheck",
  TIGRIS_STORAGE_ENDPOINT: "https://t3.storage.dev",
  TIGRIS_STORAGE_ACCESS_KEY_ID: "key",
  TIGRIS_STORAGE_SECRET_ACCESS_KEY: "secret",
  OKX_API_KEY: "okx-key",
  OKX_SECRET_KEY: "okx-secret",
  OKX_PASSPHRASE: "okx-pass",
  PAY_TO_ADDRESS: "0x0000000000000000000000000000000000000001",
  X402_NETWORK: "eip155:1952",
  SHIPCHECK_PRICE: "$0.01",
} as const;

describe("loadApiConfig", () => {
  it("treats blank PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH as unset", () => {
    const config = loadApiConfig({
      ...requiredEnv,
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "",
    });
    expect(config.playwrightChromiumExecutablePath).toBeUndefined();
  });
});
