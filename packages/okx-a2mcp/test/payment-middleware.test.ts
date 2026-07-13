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
        "POST /v1/verify": {
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
        },
      },
      expect.anything(),
      undefined,
      undefined,
      false,
    );
  });

  it("can sync facilitator on start when explicitly enabled", () => {
    createOkxPaymentMiddleware({ ...config, syncFacilitatorOnStart: true });

    expect(sdk.middleware).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      undefined,
      true,
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
