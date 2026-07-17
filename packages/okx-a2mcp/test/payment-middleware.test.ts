import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => {
  const facilitator = vi.fn();
  const register = vi.fn();
  const scheme = vi.fn();
  const middleware = vi.fn(() => vi.fn());
  return { facilitator, register, scheme, middleware };
});

vi.mock("@okxweb3/x402-core", () => ({
  OKXFacilitatorClient: sdk.facilitator,
}));
vi.mock("@okxweb3/x402-evm/exact/server", () => ({
  ExactEvmScheme: sdk.scheme,
}));
vi.mock("@okxweb3/x402-express", () => ({
  paymentMiddleware: sdk.middleware,
  x402ResourceServer: vi.fn(() => ({ register: sdk.register })),
}));

import {
  createOkxPaymentMiddleware,
  type OkxPaymentConfig,
} from "../src/index.js";

const config = {
  apiKey: "api-key",
  secretKey: "secret-key",
  passphrase: "passphrase",
  network: "eip155:1952",
  payTo: "0x1111111111111111111111111111111111111111",
  price: "$0.01",
} as const;

const verifyResource = {
  accepts: [
    {
      scheme: "exact",
      network: config.network,
      payTo: config.payTo,
      price: config.price,
    },
  ],
  description: "ShipCheck Quick Acceptance verification",
  mimeType: "application/json",
  outputSchema: {
    input: {
      type: "http",
      method: "POST",
      bodyType: "json",
      body: {
        type: "object",
        required: ["brief", "deliveryUrl"],
        additionalProperties: false,
        properties: {
          brief: {
            type: "string",
            minLength: 10,
            maxLength: 12_000,
            description: "Original acceptance brief to verify.",
          },
          deliveryUrl: {
            type: "string",
            format: "uri",
            pattern: "^https://",
            description: "Public HTTPS URL of the delivered website.",
          },
          mode: {
            type: "string",
            enum: ["quick"],
            default: "quick",
          },
          maxRequirements: {
            type: "integer",
            minimum: 1,
            maximum: 12,
            default: 12,
          },
          idempotencyKey: {
            type: "string",
            minLength: 8,
            maxLength: 128,
          },
        },
      },
    },
  },
};

describe("createOkxPaymentMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wires the official OKX facilitator, EVM scheme, and Express middleware", () => {
    createOkxPaymentMiddleware(config);

    expect(sdk.facilitator).toHaveBeenCalledWith({
      apiKey: config.apiKey,
      secretKey: config.secretKey,
      passphrase: config.passphrase,
      syncSettle: true,
    });
    expect(sdk.scheme).toHaveBeenCalledOnce();
    expect(sdk.register).toHaveBeenCalledWith(
      config.network,
      expect.anything(),
    );
    expect(sdk.middleware).toHaveBeenCalledWith(
      {
        "GET /v1/verify": verifyResource,
        "POST /v1/verify": verifyResource,
      },
      expect.anything(),
      undefined,
      undefined,
      true,
    );
  });

  it("can disable facilitator sync when explicitly requested", () => {
    createOkxPaymentMiddleware({ ...config, syncFacilitatorOnStart: false });

    expect(sdk.middleware).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      undefined,
      false,
    );
  });

  it("rejects unsafe or incomplete payment configuration", () => {
    expect(() =>
      createOkxPaymentMiddleware({ ...config, apiKey: "" }),
    ).toThrow("apiKey");
    expect(() =>
      createOkxPaymentMiddleware({
        ...config,
        network: "base",
      } as unknown as OkxPaymentConfig),
    ).toThrow("network");
    expect(() =>
      createOkxPaymentMiddleware({ ...config, payTo: "0x1234" }),
    ).toThrow("payTo");
    expect(() =>
      createOkxPaymentMiddleware({
        ...config,
        price: "0.01",
      } as unknown as OkxPaymentConfig),
    ).toThrow("price");
  });
});
