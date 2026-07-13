import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

import { AcceptancePolicySchema } from "@shipcheck/domain";
import { createArtifactSink } from "@shipcheck/evidence-store";
import {
  createTigrisEvidenceBlobStoreFromEnv,
  createTigrisEvidenceLinkProviderFromEnv,
} from "@shipcheck/evidence-tigris";
import { ExecutionPolicySchema } from "@shipcheck/execution-planner";
import { createOpenAiCompilerModelFromEnv } from "@shipcheck/openai-compiler";
import {
  createProductionUrlGuard,
  createPublicWebWorker,
} from "@shipcheck/public-web-adapter";
import {
  applyMigrations,
  createPostgresPool,
  PostgresIdempotencyStore,
  PostgresReceiptStore,
  PostgresReportStore,
  PostgresRequestStore,
} from "@shipcheck/service-postgres";
import {
  PostgresAdvisoryLockFactory,
  RetentionService,
  RETENTION_ADVISORY_LOCK_KEY,
  retentionWindowsFromEnv,
} from "@shipcheck/service-retention";
import {
  createShipCheckMetrics,
  createStructuredLogger,
} from "@shipcheck/service-ops";
import type { VerifyResponse } from "@shipcheck/service-core";

import { loadApiConfig } from "./config.js";
import { createPaidApiApp } from "./paid-app.js";
import { createQuickVerificationOperations } from "./quick-operations.js";
import { mountStaticWeb } from "./static-web.js";

const ADAPTER_VERSION = "shipcheck-public-web-v1.0.0";
const COMPILER_VERSION = "shipcheck-openai-compiler-v1.0.0";

async function loadJsonConfig<T>(
  fileName: string,
  schema: { parse: (input: unknown) => T },
): Promise<T> {
  const configDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../developer-docs/config",
  );
  const raw = await readFile(join(configDir, fileName), "utf8");
  return schema.parse(JSON.parse(raw));
}

function resolveChromiumExecutable(config: ReturnType<typeof loadApiConfig>): string {
  if (config.playwrightChromiumExecutablePath !== undefined) {
    return config.playwrightChromiumExecutablePath;
  }
  const fromEnv = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  throw new TypeError(
    "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is required for browser execution",
  );
}

export async function startProductionServer(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = loadApiConfig(env);
  const logger = createStructuredLogger();
  const metrics = createShipCheckMetrics();
  const pool = createPostgresPool({ connectionString: config.databaseUrl });
  await applyMigrations(pool);

  const requestStore = new PostgresRequestStore<VerifyResponse>(pool);
  const receiptStore = new PostgresReceiptStore(pool);
  const reportStore = new PostgresReportStore(pool);
  const idempotencyStore = new PostgresIdempotencyStore<VerifyResponse>(pool);
  const blobStore = createTigrisEvidenceBlobStoreFromEnv(env);
  const evidenceLinkProvider = createTigrisEvidenceLinkProviderFromEnv(env);
  const artifactSink = createArtifactSink(blobStore);

  const acceptancePolicy = await loadJsonConfig(
    "acceptance-policy.v1.json",
    AcceptancePolicySchema,
  );
  const executionPolicy = await loadJsonConfig(
    "execution-policy.v1.json",
    ExecutionPolicySchema,
  );

  const compilerModel = createOpenAiCompilerModelFromEnv(env, {
    apiKey: config.openAiApiKey,
    model: config.requirementCompilerModel,
    ...(config.openAiBaseUrl === undefined
      ? {}
      : { baseUrl: config.openAiBaseUrl }),
  });

  const worker = createPublicWebWorker({
    executablePath: resolveChromiumExecutable(config),
    urlGuard: createProductionUrlGuard(),
    policy: executionPolicy,
    budgets: {
      runTimeoutMs: config.maxRunSeconds * 1000,
    },
  });

  const retentionService = new RetentionService({
    pool,
    blobStore,
    windows: retentionWindowsFromEnv(env),
    lockFactory: new PostgresAdvisoryLockFactory(RETENTION_ADVISORY_LOCK_KEY),
  });

  const operations = createQuickVerificationOperations({
    compiler: {
      model: compilerModel,
      compilerVersion: COMPILER_VERSION,
      policyVersion: acceptancePolicy.policyVersion,
      executionPolicyVersion: executionPolicy.policyVersion,
      createContractId: () => `contract_${randomUUID().replace(/-/gu, "")}`,
      now: () => new Date().toISOString(),
    },
    executionPolicy,
    acceptancePolicy,
    worker,
    artifactSink,
    adapterVersion: ADAPTER_VERSION,
    createReceiptId: () => `receipt_${randomUUID().replace(/-/gu, "")}`,
    now: () => new Date().toISOString(),
    totalTimeoutMs: config.maxRunSeconds * 1000,
    reportBaseUrl: config.publicBaseUrl,
    browserExecutionEnabled: config.browserExecutionEnabled,
    metrics,
    logger,
  });

  const app = createPaidApiApp(
    {
      operations,
      requestStore,
      receiptStore,
      reportStore,
      idempotencyStore,
      evidenceLinkProvider,
      createRequestId: () => `req_${randomUUID().replace(/-/gu, "")}`,
      now: () => new Date().toISOString(),
      verificationEnabled: config.verificationEnabled,
      telemetry: { logger, metrics },
      ...(config.metricsBearerToken === undefined
        ? {}
        : { metricsBearerToken: config.metricsBearerToken }),
      health: {
        configReady: () => true,
        postgres: {
          async ping() {
            await pool.query("SELECT 1");
          },
        },
      },
    },
    {
      apiKey: config.okxApiKey,
      secretKey: config.okxSecretKey,
      passphrase: config.okxPassphrase,
      baseUrl: config.okxBaseUrl,
      network: config.x402Network,
      payTo: config.payToAddress,
      price: config.shipcheckPrice,
    },
  );

  mountStaticWeb(app);

  const server = app.listen(config.port, "0.0.0.0", () => {
    logger.info("server.started", {
      stage: "boot",
      path: String(config.port),
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.warn("server.shutdown", { stage: "shutdown", event: signal });
    server.close(() => undefined);
    await pool.end().catch(() => undefined);
  };
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  void retentionService;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startProductionServer().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
