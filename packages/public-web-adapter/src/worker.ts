import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EvidenceArtifact, Observation } from "@shipcheck/domain";
import type { ArtifactSink } from "@shipcheck/evidence-store";
import {
  ExecutionPolicySchema,
  PlannedCheckSchema,
  type ExecutionPolicy,
  type PlannedCheck,
} from "@shipcheck/execution-planner";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Response,
} from "playwright-core";

import type { UrlGuard } from "./url-guard.js";
import { normalizeCheckResult } from "./observations.js";

type CheckExecutionStatus =
  | "SATISFIED"
  | "CONTRADICTED"
  | "INCONCLUSIVE"
  | "EXECUTION_ERROR";
type Fact = string | number | boolean | null;

export interface CheckExecutionResult {
  readonly checkId: string;
  readonly status: CheckExecutionStatus;
  readonly summary: string;
  readonly facts: Readonly<Record<string, Fact>>;
}

export interface WorkerExecutionResult {
  readonly executionStatus: "COMPLETED" | "INCOMPLETE";
  readonly targetFingerprint: {
    readonly finalUrl: string;
    readonly sha256: string;
  };
  readonly results: readonly CheckExecutionResult[];
  readonly blockedRequests: number;
  readonly contextClosed: boolean;
  readonly browserClosed: boolean;
  readonly observations: readonly Observation[];
  readonly artifacts: readonly EvidenceArtifact[];
  readonly temporaryFilesCleaned: boolean;
}

export interface WorkerRequest {
  readonly target: string;
  readonly checks: readonly PlannedCheck[];
  readonly signal?: AbortSignal;
}

export interface WorkerBudgets {
  readonly runTimeoutMs: number;
  readonly navigationTimeoutMs: number;
  readonly actionTimeoutMs: number;
}

export interface PublicWebWorkerOptions {
  readonly executablePath: string;
  readonly urlGuard: UrlGuard;
  readonly policy: ExecutionPolicy;
  readonly budgets?: Partial<WorkerBudgets>;
}

export interface EvidenceCaptureOptions {
  readonly artifactSink: ArtifactSink;
  readonly now: () => string;
  readonly tempRoot?: string;
  readonly onStage?: (
    stage: string,
    extra?: Record<string, unknown>,
  ) => void;
}

interface RunState {
  blockedRequests: number;
  popupAttempts: number;
  downloadAttempts: number;
  readonly consoleErrors: string[];
  readonly failedSameOriginRequests: number[];
}

const defaultBudgets: WorkerBudgets = {
  runTimeoutMs: 15_000,
  navigationTimeoutMs: 5_000,
  actionTimeoutMs: 1_500,
};

function result(
  check: PlannedCheck,
  status: CheckExecutionStatus,
  summary: string,
  facts: Readonly<Record<string, Fact>> = {},
): CheckExecutionResult {
  return { checkId: check.checkId, status, summary, facts };
}

function executionError(check: PlannedCheck): CheckExecutionResult {
  return result(
    check,
    "EXECUTION_ERROR",
    "The browser could not complete this check.",
  );
}

function timeoutAfter<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Public-web run budget exceeded"));
    }, timeoutMs);
    timer.unref();
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("Worker failed"));
      },
    );
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Public-web execution aborted");
}

function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  disposeLateResult: (value: T) => void | Promise<void>,
): Promise<T> {
  const dispose = (value: T): void => {
    try {
      void Promise.resolve(disposeLateResult(value)).catch(() => undefined);
    } catch {
      // Disposal is best-effort after the caller has already observed abort.
    }
  };
  if (signal === undefined) return promise;
  if (signal.aborted) {
    void promise.then(dispose, () => undefined);
    return Promise.reject(abortReason(signal));
  }
  return new Promise<T>((resolve, reject) => {
    let aborted = false;
    const onAbort = (): void => {
      aborted = true;
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (aborted) {
          dispose(value);
          return;
        }
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        if (!aborted) {
          reject(error instanceof Error ? error : new Error("Worker failed"));
        }
      },
    );
  });
}

function blockedFormText(value: string): boolean {
  return /\b(delete|remove account|pay|payment|checkout|purchase|order|wallet|sign|password|upload|publish|government|legal)\b/iu.test(
    value,
  );
}

async function semanticVisible(
  page: Page,
  semanticTarget: string,
): Promise<boolean> {
  return page.getByText(semanticTarget, { exact: false }).first().isVisible();
}

async function executeFormCheck(
  check: Extract<PlannedCheck, { intent: "FORM_ACCEPTS_INPUT" }>,
  page: Page,
  state: RunState,
  actionTimeoutMs: number,
): Promise<CheckExecutionResult> {
  const forms = page.locator("form");
  const matching = forms.filter({ hasText: check.parameters.semanticTarget });
  const form =
    (await matching.count()) > 0
      ? matching.first()
      : (await forms.count()) === 1
        ? forms.first()
        : null;
  if (form === null) {
    return result(check, "CONTRADICTED", "The expected form was not found.");
  }

  const formText = [
    check.parameters.semanticTarget,
    await form.innerText(),
    (await form.getAttribute("action")) ?? "",
  ].join(" ");
  const unsafeInputCount = await form
    .locator(
      'input[type="password"],input[type="file"],input[name*="card" i]',
    )
    .count();
  if (blockedFormText(formText) || unsafeInputCount > 0) {
    return result(
      check,
      "INCONCLUSIVE",
      "The form matched a blocked action class and was not submitted.",
      { actionBlocked: true },
    );
  }

  const email = form.locator('input[type="email"]').first();
  if ((await email.count()) === 0) {
    return result(
      check,
      "INCONCLUSIVE",
      "The form does not expose an allowed synthetic email input.",
    );
  }

  let successfulSameOriginResponse = false;
  const origin = new URL(page.url()).origin;
  const onResponse = (response: Response): void => {
    if (
      response.request().method() !== "GET" &&
      new URL(response.url()).origin === origin &&
      response.status() >= 200 &&
      response.status() < 400
    ) {
      successfulSameOriginResponse = true;
    }
  };
  page.on("response", onResponse);
  try {
    await email.fill("shipcheck+verification@example.test");
    await form.evaluate((element: HTMLFormElement) => {
      element.requestSubmit();
    });
    await page
      .waitForFunction(
        () =>
          (
            document.querySelector('[role="status"]')?.textContent ?? ""
          ).trim().length > 0,
        undefined,
        { timeout: actionTimeoutMs },
      )
      .catch(() => undefined);
  } finally {
    page.off("response", onResponse);
  }

  const confirmationText =
    (await page.locator('[role="status"]').first().textContent())?.trim() ?? "";
  const satisfied =
    confirmationText.length > 0 || successfulSameOriginResponse;
  return result(
    check,
    satisfied ? "SATISFIED" : "INCONCLUSIVE",
    satisfied
      ? "The form accepted synthetic input and produced an allowed success signal."
      : "The form produced no observable success signal.",
    {
      visibleConfirmation: confirmationText.length > 0,
      successfulSameOriginResponse,
      actionBlocked: false,
      blockedRequests: state.blockedRequests,
    },
  );
}

async function probeLink(
  context: BrowserContext,
  destination: string,
  policy: ExecutionPolicy,
  budgets: WorkerBudgets,
): Promise<void> {
  if (context.pages().length >= policy.maxPages) {
    throw new Error("Page budget exceeded");
  }
  const probe = await context.newPage();
  try {
    const response = await probe.goto(destination, {
      waitUntil: "domcontentloaded",
      timeout: budgets.navigationTimeoutMs,
    });
    if (response === null || response.status() >= 400) {
      throw new Error("Destination did not resolve successfully");
    }
  } finally {
    await probe.close();
  }
}

async function executeCheck(
  check: PlannedCheck,
  page: Page,
  context: BrowserContext,
  target: string,
  policy: ExecutionPolicy,
  budgets: WorkerBudgets,
  state: RunState,
): Promise<CheckExecutionResult> {
  switch (check.intent) {
    case "CONTENT_PRESENT": {
      const visible = await semanticVisible(
        page,
        check.parameters.semanticTarget,
      );
      return result(
        check,
        visible ? "SATISFIED" : "CONTRADICTED",
        visible ? "Expected content is visible." : "Expected content is not visible.",
        { visible },
      );
    }
    case "SECTION_PRESENT": {
      const heading = page
        .getByRole("heading", {
          name: check.parameters.semanticTarget,
          exact: false,
        })
        .first();
      const visible = (await heading.count()) > 0 && (await heading.isVisible());
      return result(
        check,
        visible ? "SATISFIED" : "CONTRADICTED",
        visible
          ? "Expected section heading is visible."
          : "Expected section heading is not visible.",
        { visible },
      );
    }
    case "LINK_RESOLVES":
    case "CTA_NAVIGATES": {
      const link = page
        .getByRole("link", {
          name: check.parameters.semanticTarget,
          exact: false,
        })
        .first();
      if ((await link.count()) === 0) {
        return result(check, "CONTRADICTED", "The expected link was not found.");
      }
      const href = await link.getAttribute("href");
      if (href === null) {
        return result(
          check,
          "CONTRADICTED",
          "The expected link has no destination.",
        );
      }
      const destination = new URL(href, page.url()).toString();
      await probeLink(context, destination, policy, budgets);
      return result(
        check,
        "SATISFIED",
        "The link destination resolved successfully.",
        { destinationOrigin: new URL(destination).origin },
      );
    }
    case "FORM_ACCEPTS_INPUT":
      return executeFormCheck(check, page, state, budgets.actionTimeoutMs);
    case "NAVIGATION_WORKS": {
      const visibility: boolean[] = [];
      for (const viewport of check.parameters.viewports) {
        await page.setViewportSize(
          viewport === "DESKTOP"
            ? policy.desktopViewport
            : policy.mobileViewport,
        );
        visibility.push(await page.getByRole("navigation").first().isVisible());
      }
      const visible = visibility.every(Boolean);
      return result(
        check,
        visible ? "SATISFIED" : "CONTRADICTED",
        visible
          ? "Primary navigation is reachable at both viewports."
          : "Primary navigation is not reachable at every viewport.",
        {
          desktopVisible: visibility[0] ?? false,
          mobileVisible: visibility[1] ?? false,
        },
      );
    }
    case "NO_HORIZONTAL_OVERFLOW": {
      const widths: number[] = [];
      for (const viewport of check.parameters.viewports) {
        await page.setViewportSize(
          viewport === "DESKTOP"
            ? policy.desktopViewport
            : policy.mobileViewport,
        );
        widths.push(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        );
      }
      const withinTolerance = widths.every(
        (width) => width <= check.parameters.tolerancePixels,
      );
      return result(
        check,
        withinTolerance ? "SATISFIED" : "CONTRADICTED",
        withinTolerance
          ? "No horizontal overflow exceeds tolerance."
          : "Horizontal overflow exceeds tolerance.",
        {
          desktopOverflowPixels: widths[0] ?? 0,
          mobileOverflowPixels: widths[1] ?? 0,
        },
      );
    }
    case "ASSETS_LOAD": {
      const brokenImages = await page.locator("img").evaluateAll((images) =>
        images.filter(
          (image) =>
            !(image as HTMLImageElement).complete ||
            (image as HTMLImageElement).naturalWidth === 0,
        ).length,
      );
      return result(
        check,
        brokenImages === 0 ? "SATISFIED" : "CONTRADICTED",
        brokenImages === 0
          ? "Required images loaded."
          : "One or more required images failed to load.",
        { brokenImages },
      );
    }
    case "NO_SEVERE_CONSOLE_ERRORS": {
      const count = state.consoleErrors.length;
      return result(
        check,
        count === 0 ? "SATISFIED" : "CONTRADICTED",
        count === 0
          ? "No severe console errors were observed."
          : "Severe console errors were observed.",
        { severeConsoleErrors: count },
      );
    }
    case "NO_FAILED_SAME_ORIGIN_REQUESTS": {
      const count = state.failedSameOriginRequests.filter(
        (status) => status >= check.parameters.failureStatusThreshold,
      ).length;
      return result(
        check,
        count === 0 ? "SATISFIED" : "CONTRADICTED",
        count === 0
          ? "No failed same-origin requests were observed."
          : "Failed same-origin requests were observed.",
        { failedSameOriginRequests: count },
      );
    }
    case "HTTPS_ENABLED": {
      const enabled = new URL(target).protocol === "https:";
      return result(
        check,
        enabled ? "SATISFIED" : "CONTRADICTED",
        enabled ? "The target uses HTTPS." : "The target does not use HTTPS.",
        { https: enabled },
      );
    }
    case "METADATA_PRESENT": {
      const title = (await page.title()).trim();
      const description = (
        (await page
          .locator('meta[name="description"]')
          .getAttribute("content")) ?? ""
      ).trim();
      const present = title.length > 0 && description.length > 0;
      return result(
        check,
        present ? "SATISFIED" : "CONTRADICTED",
        present
          ? "Required metadata is present."
          : "Required metadata is missing.",
        {
          titlePresent: title.length > 0,
          descriptionPresent: description.length > 0,
        },
      );
    }
    case "BASIC_ACCESSIBILITY": {
      const facts = await page.evaluate(() => ({
        documentLanguage: document.documentElement.lang.trim().length > 0,
        pageTitle: document.title.trim().length > 0,
        imagesHaveAlt: [...document.images].every((image) =>
          image.hasAttribute("alt"),
        ),
        controlsHaveLabels: [
          ...document.querySelectorAll<HTMLInputElement>(
            "input,select,textarea",
          ),
        ].every((control) => control.labels !== null && control.labels.length > 0),
      }));
      const passed = Object.values(facts).every(Boolean);
      return result(
        check,
        passed ? "SATISFIED" : "CONTRADICTED",
        passed
          ? "Basic accessibility checks passed."
          : "One or more basic accessibility checks failed.",
        facts,
      );
    }
  }
}

export class PublicWebWorker {
  private readonly policy: ExecutionPolicy;
  private readonly budgets: WorkerBudgets;

  constructor(private readonly options: PublicWebWorkerOptions) {
    this.policy = ExecutionPolicySchema.parse(options.policy);
    this.budgets = { ...defaultBudgets, ...options.budgets };
  }

  execute(request: WorkerRequest): Promise<WorkerExecutionResult> {
    return this.executeInternal(request);
  }

  executeWithEvidence(
    request: WorkerRequest,
    capture: EvidenceCaptureOptions,
  ): Promise<WorkerExecutionResult> {
    return this.executeInternal(request, capture);
  }

  private async executeInternal(
    request: WorkerRequest,
    capture?: EvidenceCaptureOptions,
  ): Promise<WorkerExecutionResult> {
    const checks = request.checks.map((check) =>
      PlannedCheckSchema.parse(check),
    );
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    let contextClosed = false;
    let browserClosed = false;
    let temporaryFilesCleaned = true;
    let tempDirectory: string | undefined;
    let tracingStarted = false;
    const artifacts = new Map<string, EvidenceArtifact>();
    const evidenceByCheck = new Map<string, string[]>();
    const observedAt = capture?.now();
    const attachArtifact = async (
      type: EvidenceArtifact["type"],
      contentType: string,
      bytes: Uint8Array,
      checkIds: readonly string[],
    ): Promise<void> => {
      if (capture === undefined || observedAt === undefined) return;
      const artifact = await capture.artifactSink.write({
        type,
        contentType,
        bytes,
        createdAt: observedAt,
        redactionApplied: false,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
      artifacts.set(artifact.id, artifact);
      for (const checkId of checkIds) {
        const ids = evidenceByCheck.get(checkId) ?? [];
        ids.push(artifact.id);
        evidenceByCheck.set(checkId, ids);
      }
    };
    const captureScreenshot = async (checkId: string): Promise<void> => {
      if (
        capture === undefined ||
        page === undefined ||
        page.isClosed()
      ) {
        return;
      }
      const bytes = await page.screenshot({
        fullPage: true,
        type: "png",
        animations: "disabled",
      });
      await attachArtifact("SCREENSHOT", "image/png", bytes, [checkId]);
    };
    const state: RunState = {
      blockedRequests: 0,
      popupAttempts: 0,
      downloadAttempts: 0,
      consoleErrors: [],
      failedSameOriginRequests: [],
    };
    let results: readonly CheckExecutionResult[] = [];
    let executionStatus: "COMPLETED" | "INCOMPLETE" = "INCOMPLETE";
    let targetFingerprint = {
      finalUrl: request.target,
      sha256: createHash("sha256").update(request.target).digest("hex"),
    };
    const abortActiveWork = (): void => {
      void context?.close({ reason: "ShipCheck run aborted" }).catch(() => undefined);
      void browser?.close().catch(() => undefined);
    };
    request.signal?.addEventListener("abort", abortActiveWork, { once: true });

    const emitStage = (
      stage: string,
      extra: Record<string, unknown> = {},
    ): void => {
      capture?.onStage?.(stage, extra);
    };

    try {
      request.signal?.throwIfAborted();
      const target = await this.options.urlGuard.validate(request.target);
      request.signal?.throwIfAborted();
      emitStage("browser_started");
      browser = await raceWithAbort(
        chromium.launch({
          executablePath: this.options.executablePath,
          headless: true,
          args: ["--disable-dev-shm-usage"],
        }),
        request.signal,
        (lateBrowser) => lateBrowser.close(),
      );
      context = await browser.newContext({
        acceptDownloads: false,
        serviceWorkers: "block",
        viewport: this.policy.desktopViewport,
      });
      context.setDefaultTimeout(this.budgets.actionTimeoutMs);
      context.setDefaultNavigationTimeout(this.budgets.navigationTimeoutMs);
      const guardedContext = context;
      if (capture !== undefined) {
        tempDirectory = await mkdtemp(
          join(capture.tempRoot ?? tmpdir(), "shipcheck-run-"),
        );
        temporaryFilesCleaned = false;
        await guardedContext.tracing.start({
          screenshots: true,
          snapshots: true,
          sources: false,
        });
        tracingStarted = true;
      }

      await guardedContext.route("**/*", async (route) => {
        const routedRequest = route.request();
        let depth = 0;
        for (
          let previous = routedRequest.redirectedFrom();
          previous !== null;
          previous = previous.redirectedFrom()
        ) {
          depth += 1;
        }
        try {
          if (depth > this.policy.maxRedirects) {
            throw new Error("Redirect budget exceeded");
          }
          await this.options.urlGuard.validate(routedRequest.url());
          await route.continue();
        } catch {
          state.blockedRequests += 1;
          await route.abort("blockedbyclient");
        }
      });
      guardedContext.on("console", (message) => {
        if (message.type() === "error") state.consoleErrors.push(message.text());
      });
      guardedContext.on("weberror", (error) => {
        state.consoleErrors.push(error.error().message);
      });
      guardedContext.on("response", (response) => {
        const location = response.headers()["location"];
        if (
          response.status() >= 300 &&
          response.status() < 400 &&
          location !== undefined
        ) {
          void this.options.urlGuard
            .validateRedirect(response.url(), location)
            .catch(() => {
              state.blockedRequests += 1;
            });
        }
        if (
          new URL(response.url()).origin ===
            new URL(target.normalizedUrl).origin &&
          response.status() >= 400
        ) {
          state.failedSameOriginRequests.push(response.status());
        }
      });

      page = await guardedContext.newPage();
      const activePage = page;
      activePage.on("popup", (popup) => {
        state.popupAttempts += 1;
        if (
          state.popupAttempts > this.policy.maxPopups ||
          guardedContext.pages().length > this.policy.maxPages
        ) {
          void popup.close();
        }
      });
      activePage.on("download", (download) => {
        state.downloadAttempts += 1;
        void download.cancel();
      });
      activePage.on("dialog", (dialog) => void dialog.dismiss());

      const run = async (): Promise<readonly CheckExecutionResult[]> => {
        const response = await activePage.goto(target.normalizedUrl, {
          waitUntil: "load",
          timeout: this.budgets.navigationTimeoutMs,
        });
        if (response === null) {
          throw new Error("Target navigation returned no response");
        }
        let navigationUrl = target.normalizedUrl;
        try {
          const parsed = new URL(activePage.url());
          navigationUrl = `${parsed.origin}${parsed.pathname}`;
        } catch {
          try {
            const parsed = new URL(target.normalizedUrl);
            navigationUrl = `${parsed.origin}${parsed.pathname}`;
          } catch {
            navigationUrl = "[invalid-url]";
          }
        }
        emitStage("navigation_completed", { url: navigationUrl });
        const checkResults: CheckExecutionResult[] = [];
        for (const check of checks) {
          let checkResult: CheckExecutionResult;
          try {
            checkResult = await executeCheck(
              check,
              activePage,
              guardedContext,
              target.normalizedUrl,
              this.policy,
              this.budgets,
              state,
            );
          } catch {
            checkResult = executionError(check);
          }
          checkResults.push(checkResult);
          if (
            checkResult.status === "CONTRADICTED" ||
            checkResult.status === "EXECUTION_ERROR"
          ) {
            await captureScreenshot(checkResult.checkId);
          }
        }
        return checkResults;
      };
      results = await timeoutAfter(run(), this.budgets.runTimeoutMs);
      executionStatus = results.some(
        ({ status }) => status === "EXECUTION_ERROR",
      )
        ? "INCOMPLETE"
        : "COMPLETED";
      const finalUrl = activePage.url();
      const html = await activePage.content();
      targetFingerprint = {
        finalUrl,
        sha256: createHash("sha256").update(html, "utf8").digest("hex"),
      };
    } catch {
      results = checks.map(executionError);
      executionStatus = "INCOMPLETE";
    } finally {
      if (capture !== undefined && page !== undefined && !page.isClosed()) {
        for (const checkResult of results) {
          if (
            (checkResult.status === "CONTRADICTED" ||
              checkResult.status === "EXECUTION_ERROR") &&
            (evidenceByCheck.get(checkResult.checkId)?.length ?? 0) === 0
          ) {
            await captureScreenshot(checkResult.checkId).catch(() => {
              executionStatus = "INCOMPLETE";
            });
          }
        }
      }
      if (context !== undefined && tracingStarted) {
        const traceCheckIds = results
          .filter(
            ({ status }) =>
              (status === "CONTRADICTED" &&
                this.policy.captureTraceOn.includes("FAIL")) ||
              (status === "EXECUTION_ERROR" &&
                this.policy.captureTraceOn.includes("EXECUTION_ERROR")),
          )
          .map(({ checkId }) => checkId);
        try {
          if (traceCheckIds.length > 0 && tempDirectory !== undefined) {
            const tracePath = join(tempDirectory, "trace.zip");
            await context.tracing.stop({ path: tracePath });
            tracingStarted = false;
            await attachArtifact(
              "TRACE",
              "application/zip",
              await readFile(tracePath),
              traceCheckIds,
            );
          } else {
            await context.tracing.stop();
            tracingStarted = false;
          }
        } catch {
          executionStatus = "INCOMPLETE";
        }
      }
      if (context !== undefined) {
        await context
          .close({ reason: "ShipCheck run completed" })
          .catch(() => undefined);
        contextClosed = true;
      }
      if (browser !== undefined) {
        await browser.close().catch(() => undefined);
        browserClosed = true;
      }
      if (tempDirectory !== undefined) {
        temporaryFilesCleaned = await rm(tempDirectory, {
          recursive: true,
          force: true,
        }).then(
          () => true,
          () => false,
        );
      }
      request.signal?.removeEventListener("abort", abortActiveWork);
    }

    const observations =
      observedAt === undefined
        ? []
        : results.map((checkResult) =>
            normalizeCheckResult(
              checkResult,
              evidenceByCheck.get(checkResult.checkId) ?? [],
              observedAt,
            ),
          );
    return {
      executionStatus,
      targetFingerprint,
      results,
      blockedRequests: state.blockedRequests,
      contextClosed,
      browserClosed,
      observations,
      artifacts: [...artifacts.values()].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
      temporaryFilesCleaned,
    };
  }
}

export function createPublicWebWorker(
  options: PublicWebWorkerOptions,
): PublicWebWorker {
  return new PublicWebWorker(options);
}
