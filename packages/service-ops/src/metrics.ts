import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

export interface ShipCheckMetrics {
  recordHttpRequest(input: {
    readonly method: string;
    readonly route: string;
    readonly statusCode: number;
    readonly durationMs: number;
    readonly paid: boolean;
  }): void;
  recordCompilerFailure(): void;
  recordContractStats(input: {
    readonly requirements: number;
    readonly executableRatio: number;
  }): void;
  recordRunDuration(durationMs: number): void;
  recordBrowserCrash(): void;
  recordVerdict(verdict: string): void;
  recordEvidenceBytes(bytes: number): void;
  recordSsrfBlock(): void;
  recordBlockedAction(count?: number): void;
  recordIdempotencyHit(): void;
  recordIdempotencyConflict(): void;
  recordPaymentFailure(): void;
  recordPersistenceFailure(): void;
  registry: Registry;
}

export interface ShipCheckMetricsOptions {
  readonly registry?: Registry;
  readonly collectProcessMetrics?: boolean;
}

export function createShipCheckMetrics(
  options: ShipCheckMetricsOptions = {},
): ShipCheckMetrics {
  const registry = options.registry ?? new Registry();
  if (options.collectProcessMetrics ?? true) {
    collectDefaultMetrics({ register: registry });
  }

  const requestsTotal = new Counter({
    name: "shipcheck_http_requests_total",
    help: "Total HTTP requests handled by the API",
    labelNames: ["method", "route", "status_code"],
    registers: [registry],
  });
  const paidRequestsTotal = new Counter({
    name: "shipcheck_paid_requests_total",
    help: "Total paid verification requests",
    registers: [registry],
  });
  const compilerFailuresTotal = new Counter({
    name: "shipcheck_compiler_failures_total",
    help: "Total requirement compiler failures",
    registers: [registry],
  });
  const requirementsPerContract = new Histogram({
    name: "shipcheck_requirements_per_contract",
    help: "Requirement count per compiled contract",
    buckets: [1, 2, 4, 6, 8, 10, 12],
    registers: [registry],
  });
  const executableRatio = new Histogram({
    name: "shipcheck_executable_ratio",
    help: "Executable requirement ratio per contract",
    buckets: [0, 0.25, 0.5, 0.75, 1],
    registers: [registry],
  });
  const runDurationSeconds = new Histogram({
    name: "shipcheck_run_duration_seconds",
    help: "End-to-end verification run duration",
    buckets: [1, 5, 10, 30, 60, 90, 120],
    registers: [registry],
  });
  const browserCrashesTotal = new Counter({
    name: "shipcheck_browser_crashes_total",
    help: "Total browser crash events during execution",
    registers: [registry],
  });
  const verdictTotal = new Counter({
    name: "shipcheck_verdict_total",
    help: "Verification verdict distribution",
    labelNames: ["verdict"],
    registers: [registry],
  });
  const evidenceBytesTotal = new Counter({
    name: "shipcheck_evidence_bytes_total",
    help: "Total evidence bytes persisted",
    registers: [registry],
  });
  const ssrfBlocksTotal = new Counter({
    name: "shipcheck_ssrf_blocks_total",
    help: "Total SSRF blocks from URL guard",
    registers: [registry],
  });
  const blockedActionsTotal = new Counter({
    name: "shipcheck_blocked_actions_total",
    help: "Total blocked browser actions",
    registers: [registry],
  });
  const idempotencyHitsTotal = new Counter({
    name: "shipcheck_idempotency_hits_total",
    help: "Total idempotent request replays",
    registers: [registry],
  });
  const idempotencyConflictsTotal = new Counter({
    name: "shipcheck_idempotency_conflicts_total",
    help: "Total idempotency key conflicts",
    registers: [registry],
  });
  const paymentFailuresTotal = new Counter({
    name: "shipcheck_payment_failures_total",
    help: "Total payment boundary failures",
    registers: [registry],
  });
  const persistenceFailuresTotal = new Counter({
    name: "shipcheck_persistence_failures_total",
    help: "Total settlement or persistence failures",
    registers: [registry],
  });

  return {
    registry,
    recordHttpRequest({ method, route, statusCode, durationMs, paid }) {
      requestsTotal.inc({
        method,
        route,
        status_code: String(statusCode),
      });
      if (paid) {
        paidRequestsTotal.inc();
      }
      runDurationSeconds.observe(durationMs / 1000);
    },
    recordCompilerFailure() {
      compilerFailuresTotal.inc();
    },
    recordContractStats({ requirements, executableRatio: ratio }) {
      requirementsPerContract.observe(requirements);
      executableRatio.observe(ratio);
    },
    recordRunDuration(durationMs) {
      runDurationSeconds.observe(durationMs / 1000);
    },
    recordBrowserCrash() {
      browserCrashesTotal.inc();
    },
    recordVerdict(verdict) {
      verdictTotal.inc({ verdict });
    },
    recordEvidenceBytes(bytes) {
      evidenceBytesTotal.inc(bytes);
    },
    recordSsrfBlock() {
      ssrfBlocksTotal.inc();
    },
    recordBlockedAction(count = 1) {
      blockedActionsTotal.inc(count);
    },
    recordIdempotencyHit() {
      idempotencyHitsTotal.inc();
    },
    recordIdempotencyConflict() {
      idempotencyConflictsTotal.inc();
    },
    recordPaymentFailure() {
      paymentFailuresTotal.inc();
    },
    recordPersistenceFailure() {
      persistenceFailuresTotal.inc();
    },
  };
}

export async function renderMetrics(metrics: ShipCheckMetrics): Promise<string> {
  return metrics.registry.metrics();
}
