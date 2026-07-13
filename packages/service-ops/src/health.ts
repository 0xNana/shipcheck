import type { RequestHandler } from "express";

export interface PostgresPing {
  ping(): Promise<void>;
}

export interface HealthHandlerOptions {
  readonly configReady: () => boolean;
  readonly postgres?: PostgresPing;
}

export interface HealthRouterHandlers {
  readonly legacyHealth: RequestHandler;
  readonly live: RequestHandler;
  readonly ready: RequestHandler;
}

export function createHealthHandlers(
  options: HealthHandlerOptions,
): HealthRouterHandlers {
  const legacyHealth: RequestHandler = (_request, response) => {
    response.json({ status: "ok" });
  };

  const live: RequestHandler = (_request, response) => {
    response.json({ status: "live" });
  };

  const ready: RequestHandler = async (_request, response) => {
    if (!options.configReady()) {
      response.status(503).json({
        status: "not_ready",
        checks: { config: false },
      });
      return;
    }
    const checks: Record<string, boolean> = { config: true };
    if (options.postgres !== undefined) {
      try {
        await options.postgres.ping();
        checks["postgres"] = true;
      } catch {
        checks["postgres"] = false;
        response.status(503).json({ status: "not_ready", checks });
        return;
      }
    }
    response.json({ status: "ready", checks });
  };

  return { legacyHealth, live, ready };
}

export function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  throw new TypeError(`Expected a boolean env value, received ${value}`);
}

export interface IncidentGateConfig {
  readonly verificationEnabled: boolean;
  readonly browserExecutionEnabled: boolean;
}

export function incidentGatesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): IncidentGateConfig {
  return {
    verificationEnabled: parseBooleanEnv(env["VERIFICATION_ENABLED"], true),
    browserExecutionEnabled: parseBooleanEnv(
      env["BROWSER_EXECUTION_ENABLED"],
      true,
    ),
  };
}
