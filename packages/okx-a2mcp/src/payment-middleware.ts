import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import {
  paymentMiddleware,
  x402ResourceServer,
} from "@okxweb3/x402-express";
import type { RequestHandler } from "express";

export interface OkxPaymentConfig {
  readonly apiKey: string;
  readonly secretKey: string;
  readonly passphrase: string;
  readonly baseUrl?: string;
  readonly network: `eip155:${number}`;
  readonly payTo: string;
  readonly price: `$${string}`;
  readonly syncSettle?: boolean;
  readonly syncFacilitatorOnStart?: boolean;
}

function requireNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`OKX payment ${name} must not be empty`);
  }
}

function validateConfig(config: OkxPaymentConfig): void {
  requireNonEmpty("apiKey", config.apiKey);
  requireNonEmpty("secretKey", config.secretKey);
  requireNonEmpty("passphrase", config.passphrase);
  if (!/^eip155:\d+$/u.test(config.network)) {
    throw new TypeError("OKX payment network must use an eip155 CAIP-2 ID");
  }
  if (!/^0x[a-fA-F0-9]{40}$/u.test(config.payTo)) {
    throw new TypeError("OKX payment payTo must be an EVM address");
  }
  if (!/^\$(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u.test(config.price)) {
    throw new TypeError("OKX payment price must be a USD amount");
  }
  if (Number(config.price.slice(1)) <= 0) {
    throw new TypeError("OKX payment price must be greater than zero");
  }
}

/** Shared x402 resource metadata for marketplace GET probes and POST verify. */
function verifyX402Resource(config: OkxPaymentConfig) {
  return {
    accepts: [
      {
        scheme: "exact" as const,
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
}

/**
 * Creates the paid boundary for the billable verification route.
 *
 * Official SDK integration:
 * https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk
 */
export function createOkxPaymentMiddleware(
  config: OkxPaymentConfig,
): RequestHandler {
  validateConfig(config);
  const facilitator = new OKXFacilitatorClient({
    apiKey: config.apiKey,
    secretKey: config.secretKey,
    passphrase: config.passphrase,
    ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
    syncSettle: config.syncSettle ?? true,
  });
  const resourceServer = new x402ResourceServer(facilitator);
  resourceServer.register(config.network, new ExactEvmScheme());

  const verifyResource = verifyX402Resource(config);

  return paymentMiddleware(
    {
      // Body-less GET probes (onchainos x402-validate) must receive 402, not SPA/API 404.
      "GET /v1/verify": verifyResource,
      "POST /v1/verify": verifyResource,
    },
    resourceServer,
    undefined,
    undefined,
    config.syncFacilitatorOnStart ?? true,
  );
}
