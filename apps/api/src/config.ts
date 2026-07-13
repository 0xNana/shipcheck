import { z } from "zod";

import { resolveTigrisStorageEnv } from "@shipcheck/evidence-tigris";
import { incidentGatesFromEnv, parseBooleanEnv } from "@shipcheck/service-ops";

const usdPricePattern = /^\$(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u;
const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/u;
const eip155Pattern = /^eip155:\d+$/u;

const positiveInt = z.coerce.number().int().positive();
const nonEmptyString = z.string().trim().min(1);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: positiveInt.default(3000),
    PUBLIC_BASE_URL: z.url(),
    METRICS_BEARER_TOKEN: nonEmptyString.optional(),
    VERIFICATION_ENABLED: z.string().optional(),
    BROWSER_EXECUTION_ENABLED: z.string().optional(),
    OPENAI_API_KEY: nonEmptyString,
    OPENAI_BASE_URL: z.url().optional(),
    REQUIREMENT_COMPILER_MODEL: nonEmptyString,
    DATABASE_URL: nonEmptyString,
    REDIS_URL: z.string().optional(),
    TIGRIS_STORAGE_ENDPOINT: z.url().optional(),
    TIGRIS_STORAGE_ACCESS_KEY_ID: z.string().optional(),
    TIGRIS_STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
    TIGRIS_STORAGE_BUCKET: z.string().optional(),
    TIGRIS_STORAGE_REGION: z.string().optional(),
    AWS_ENDPOINT_URL_S3: z.url().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_REGION: z.string().optional(),
    BUCKET_NAME: z.string().optional(),
    EVIDENCE_RETENTION_DAYS: positiveInt.default(7),
    REQUEST_RETENTION_DAYS: positiveInt.default(30),
    RECEIPT_RETENTION_DAYS: positiveInt.default(30),
    OKX_API_KEY: nonEmptyString,
    OKX_SECRET_KEY: nonEmptyString,
    OKX_PASSPHRASE: nonEmptyString,
    OKX_BASE_URL: z.url().default("https://web3.okx.com"),
    PAY_TO_ADDRESS: z.string().regex(evmAddressPattern),
    X402_NETWORK: z.string().regex(eip155Pattern),
    SHIPCHECK_PRICE: z.string().regex(usdPricePattern),
    WORKER_CONCURRENCY: positiveInt.default(2),
    MAX_RUN_SECONDS: positiveInt.default(90),
    MAX_EVIDENCE_BYTES: positiveInt.default(25_000_000),
    ALLOW_FREE_TEST_ROUTE: z.string().optional(),
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: nonEmptyString.optional(),
  })
  .superRefine((env, context) => {
    if (Number(env.SHIPCHECK_PRICE.slice(1)) <= 0) {
      context.addIssue({
        code: "custom",
        message: "SHIPCHECK_PRICE must be greater than zero",
        path: ["SHIPCHECK_PRICE"],
      });
    }
    const hasTigrisCredentials =
      (env.TIGRIS_STORAGE_ENDPOINT !== undefined &&
        env.TIGRIS_STORAGE_ACCESS_KEY_ID !== undefined &&
        env.TIGRIS_STORAGE_SECRET_ACCESS_KEY !== undefined) ||
      (env.AWS_ENDPOINT_URL_S3 !== undefined &&
        env.AWS_ACCESS_KEY_ID !== undefined &&
        env.AWS_SECRET_ACCESS_KEY !== undefined);
    if (!hasTigrisCredentials) {
      context.addIssue({
        code: "custom",
        message:
          "Object storage requires TIGRIS_STORAGE_ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY (or AWS_ENDPOINT_URL_S3/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)",
        path: ["TIGRIS_STORAGE_ENDPOINT"],
      });
    }
  });

export type ApiConfig = {
  readonly nodeEnv: "development" | "test" | "production";
  readonly port: number;
  readonly publicBaseUrl: string;
  readonly metricsBearerToken?: string;
  readonly verificationEnabled: boolean;
  readonly browserExecutionEnabled: boolean;
  readonly openAiApiKey: string;
  readonly openAiBaseUrl?: string;
  readonly requirementCompilerModel: string;
  readonly databaseUrl: string;
  readonly redisUrl?: string;
  readonly objectStoreEndpoint: string;
  readonly objectStoreBucket: string;
  readonly objectStoreAccessKey: string;
  readonly objectStoreSecretKey: string;
  readonly objectStoreRegion: string;
  readonly evidenceRetentionDays: number;
  readonly requestRetentionDays: number;
  readonly receiptRetentionDays: number;
  readonly okxApiKey: string;
  readonly okxSecretKey: string;
  readonly okxPassphrase: string;
  readonly okxBaseUrl: string;
  readonly payToAddress: string;
  readonly x402Network: `eip155:${number}`;
  readonly shipcheckPrice: `$${string}`;
  readonly workerConcurrency: number;
  readonly maxRunSeconds: number;
  readonly maxEvidenceBytes: number;
  readonly allowFreeTestRoute: boolean;
  readonly playwrightChromiumExecutablePath?: string;
};

function parseX402Network(value: string): `eip155:${number}` {
  if (!eip155Pattern.test(value)) {
    throw new TypeError("X402_NETWORK must use an eip155 CAIP-2 ID");
  }
  return value as `eip155:${number}`;
}

function parseShipcheckPrice(value: string): `$${string}` {
  if (!usdPricePattern.test(value)) {
    throw new TypeError("SHIPCHECK_PRICE must be a USD amount");
  }
  return value as `$${string}`;
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = EnvSchema.parse(env);
  const gates = incidentGatesFromEnv(env);
  const storage = resolveTigrisStorageEnv(env);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    publicBaseUrl: parsed.PUBLIC_BASE_URL,
    ...(parsed.METRICS_BEARER_TOKEN === undefined
      ? {}
      : { metricsBearerToken: parsed.METRICS_BEARER_TOKEN }),
    verificationEnabled: gates.verificationEnabled,
    browserExecutionEnabled: gates.browserExecutionEnabled,
    openAiApiKey: parsed.OPENAI_API_KEY,
    ...(parsed.OPENAI_BASE_URL === undefined
      ? {}
      : { openAiBaseUrl: parsed.OPENAI_BASE_URL }),
    requirementCompilerModel: parsed.REQUIREMENT_COMPILER_MODEL,
    databaseUrl: parsed.DATABASE_URL,
    ...(parsed.REDIS_URL === undefined || parsed.REDIS_URL.length === 0
      ? {}
      : { redisUrl: parsed.REDIS_URL }),
    objectStoreEndpoint: storage.endpoint,
    objectStoreBucket: storage.bucket,
    objectStoreAccessKey: storage.accessKeyId,
    objectStoreSecretKey: storage.secretAccessKey,
    objectStoreRegion: storage.region,
    evidenceRetentionDays: parsed.EVIDENCE_RETENTION_DAYS,
    requestRetentionDays: parsed.REQUEST_RETENTION_DAYS,
    receiptRetentionDays: parsed.RECEIPT_RETENTION_DAYS,
    okxApiKey: parsed.OKX_API_KEY,
    okxSecretKey: parsed.OKX_SECRET_KEY,
    okxPassphrase: parsed.OKX_PASSPHRASE,
    okxBaseUrl: parsed.OKX_BASE_URL,
    payToAddress: parsed.PAY_TO_ADDRESS,
    x402Network: parseX402Network(parsed.X402_NETWORK),
    shipcheckPrice: parseShipcheckPrice(parsed.SHIPCHECK_PRICE),
    workerConcurrency: parsed.WORKER_CONCURRENCY,
    maxRunSeconds: parsed.MAX_RUN_SECONDS,
    maxEvidenceBytes: parsed.MAX_EVIDENCE_BYTES,
    allowFreeTestRoute: parseBooleanEnv(parsed.ALLOW_FREE_TEST_ROUTE, false),
    ...(parsed.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH === undefined
      ? {}
      : {
          playwrightChromiumExecutablePath:
            parsed.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        }),
  };
}
