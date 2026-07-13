import {
  createOkxPaymentMiddleware,
  type OkxPaymentConfig,
} from "@shipcheck/okx-a2mcp";
import type { RequestHandler } from "express";
import type { ShipCheckMetrics } from "@shipcheck/service-ops";

import { createApiApp, type ApiAppOptions } from "./app.js";

export type PaidApiAppOptions = Omit<ApiAppOptions, "paymentMiddleware">;

export function createPaidApiApp(
  options: PaidApiAppOptions,
  payment: OkxPaymentConfig,
): ReturnType<typeof createApiApp> {
  const paymentMiddleware = wrapPaymentMiddleware(
    createOkxPaymentMiddleware(payment),
    options.telemetry?.metrics,
  );
  return createApiApp({
    ...options,
    paymentMiddleware,
  });
}

function wrapPaymentMiddleware(
  middleware: RequestHandler,
  metrics: ShipCheckMetrics | undefined,
): RequestHandler {
  return (request, response, next) => {
    const originalStatus = response.status.bind(response);
    response.status = ((code: number) => {
      if (code === 402) {
        metrics?.recordPaymentFailure();
      }
      return originalStatus(code);
    }) as typeof response.status;
    middleware(request, response, next);
  };
}
