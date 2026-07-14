import { setDefaultResultOrder } from "node:dns";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";

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
  parseBooleanEnv,
} from "@shipcheck/service-ops";
import type { VerifyResponse } from "@shipcheck/service-core";
import express from "express";

import { loadApiConfig } from "./config.js";
import { createPaidApiApp } from "./paid-app.js";
import { createQuickVerificationOperations } from "./quick-operations.js";
import { mountStaticWeb } from "./static-web.js";

setDefaultResultOrder("ipv4first");

const ADAPTER_VERSION = "shipcheck-public-web-v1.0.0";
const COMPILER_VERSION = "shipcheck-openai-compiler-v1.0.0";

export interface StartProductionServerOptions {
  readonly replaceServer?: Server;
}

async function loadJsonConfig<T>(
  fileName: string,
  schema: { parse: (input: unknown) => T },
): Promise<T> {
  const configDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../config",
  );
  const raw = await readFile(join(configDir, fileName), "utf8");
  return schema.parse(JSON.parse(raw));
}

const DEFAULT_CHROMIUM_EXECUTABLE = "/usr/local/bin/shipcheck-chromium";

function resolveChromiumExecutable(config: ReturnType<typeof loadApiConfig>): string {
  if (config.playwrightChromiumExecutablePath !== undefined) {
    return config.playwrightChromiumExecutablePath;
  }
  const fromEnv = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  return DEFAULT_CHROMIUM_EXECUTABLE;
}

function listen(app: express.Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "0.0.0.0", () => {
      resolve(server);
    });
    server.once("error", reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function startProductionServer(
  env: NodeJS.ProcessEnv = process.env,
  options: StartProductionServerOptions = {},
): Promise<void> {
  const logger = createStructuredLogger();
  const config = loadApiConfig(env);
  const metrics = createShipCheckMetrics();
  const pool = createPostgresPool({ connectionString: config.databaseUrl });

  try {
    // Migrations run in Railway pre-deploy; skip duplicate work on boot.
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
        corsAllowedOrigins: config.corsAllowedOrigins,
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
        syncFacilitatorOnStart: parseBooleanEnv(
          env["OKX_SYNC_FACILITATOR_ON_START"],
          true,
        ),
      },
    );

    mountStaticWeb(app);

    if (options.replaceServer !== undefined) {
      await closeServer(options.replaceServer);
    }
    const server = await listen(app, config.port);
    logger.info("server.started", {
      stage: "boot",
      path: String(config.port),
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
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startProductionServer().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: "server.boot_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    console.error(error);
    process.exit(1);
  });
}
