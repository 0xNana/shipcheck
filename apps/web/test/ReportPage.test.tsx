import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { ReportPage } from "../src/pages/ReportPage.js";

const bundle = {
  receiptId: "receipt_1",
  contract: {
    schemaVersion: "shipcheck-acceptance-contract-v1.0.0",
    contractId: "contract_1",
    compilerVersion: "compiler-v1",
    policyVersion: "policy-v1",
    executionPolicyVersion: "execution-v1",
    target: "https://example.com/",
    requirements: [
      {
        id: "req_1",
        statement: "A pricing section is present.",
        provenance: {
          kind: "BRIEF_SPAN",
          sourceText: "pricing",
          start: 0,
          end: 7,
        },
        priority: "REQUIRED",
        prioritySource: "DEFAULT",
        confidence: 1,
        class: "EXECUTABLE",
        adapter: "PUBLIC_WEB",
        intent: "SECTION_PRESENT",
      },
    ],
    createdAt: "2026-07-12T20:00:00.000Z",
    contractHash: "a".repeat(64),
  },
  verdict: "CHANGES_REQUIRED",
  summary: {
    total: 1,
    passed: 0,
    failed: 1,
    unverified: 0,
    notObjectivelyTestable: 0,
    unsupported: 0,
  },
  results: [
    {
      requirementId: "req_1",
      priority: "REQUIRED",
      status: "FAIL",
      checkIds: ["check_1"],
      observationIds: ["obs_1"],
      evidenceIds: ["ev_1"],
      expected: "A pricing section is present.",
      observed: "Pricing section missing.",
      repairHint: "Add a visible pricing section.",
      rerunEligible: true,
    },
  ],
  receipt: {
    receiptSchemaVersion: "shipcheck-acceptance-receipt-v1.0.0",
    receiptId: "receipt_1",
    contractHash: "a".repeat(64),
    contractSchemaVersion: "shipcheck-acceptance-contract-v1.0.0",
    target: "https://example.com/",
    targetFingerprint: {
      finalUrl: "https://example.com/",
      sha256: "b".repeat(64),
    },
    compilerVersion: "compiler-v1",
    executionPolicyVersion: "execution-v1",
    adapterVersion: "adapter-v1",
    evidenceManifestVersion: "shipcheck-evidence-manifest-v1.0.0",
    verdict: "CHANGES_REQUIRED",
    summary: {
      total: 1,
      passed: 0,
      failed: 1,
      unverified: 0,
      notObjectivelyTestable: 0,
      unsupported: 0,
    },
    results: [],
    evidenceManifestHash: "c".repeat(64),
    policyVersion: "policy-v1",
    testedAt: "2026-07-12T20:00:01.000Z",
    receiptHash: "d".repeat(64),
  },
  evidenceManifest: {
    schemaVersion: "shipcheck-evidence-manifest-v1.0.0",
    artifacts: [
      {
        id: "ev_1",
        type: "SCREENSHOT",
        sha256: "e".repeat(64),
        contentType: "image/png",
        sizeBytes: 12,
        createdAt: "2026-07-12T20:00:01.000Z",
        redaction: { applied: false },
      },
    ],
    evidenceManifestHash: "c".repeat(64),
  },
  createdAt: "2026-07-12T20:00:02.000Z",
};

function renderReport(receiptId = "receipt_1") {
  return render(
    <MemoryRouter initialEntries={[`/reports/${receiptId}`]}>
      <Routes>
        <Route path="/reports/:receiptId" element={<ReportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function mockFetch(
  handler: (url: string) => Response,
): typeof fetch {
  return ((input: RequestInfo | URL) =>
    Promise.resolve(handler(urlOf(input))));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ReportPage", () => {
  it("renders verdict text, summary, requirement details, and receipt hash", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/v1/reports/receipt_1") && !url.includes("/evidence/")) {
          return Response.json(bundle);
        }
        if (url.includes("/v1/receipts/receipt_1/verify")) {
          return Response.json({
            receiptId: "receipt_1",
            valid: true,
            checks: { receiptHash: true },
          });
        }
        return new Response("missing", { status: 404 });
      }),
    );

    renderReport();

    expect(await screen.findByRole("heading", { name: /Changes required/i })).toBeInTheDocument();
    expect(screen.getByText(/CHANGES_REQUIRED/)).toBeInTheDocument();
    expect(screen.getByLabelText("Failed: 1")).toBeInTheDocument();
    expect(screen.getByText("Expected:")).toBeInTheDocument();
    expect(screen.getByText("Observed:")).toBeInTheDocument();
    expect(screen.getByText("Repair hint:")).toBeInTheDocument();
    expect(screen.getByLabelText("Receipt hash")).toHaveTextContent("d".repeat(64));
    expect(screen.getByText("Receipt hash verified")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Acceptance limitation" }),
    ).toBeInTheDocument();
  });

  it("shows a not-found state when the report is missing", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() =>
        Response.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Report was not found",
            },
          },
          { status: 404 },
        ),
      ),
    );

    renderReport("missing");

    expect(
      await screen.findByRole("heading", { name: "Report not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Report was not found");
  });

  it("surfaces an expired evidence state when the artifact link is gone", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/evidence/ev_1/link")) {
          return Response.json(
            {
              error: {
                code: "NOT_FOUND",
                message: "Evidence artifact was not found",
              },
            },
            { status: 404 },
          );
        }
        if (url.includes("/v1/reports/receipt_1") && !url.includes("/evidence/")) {
          return Response.json(bundle);
        }
        if (url.includes("/verify")) {
          return Response.json({
            receiptId: "receipt_1",
            valid: true,
            checks: { receiptHash: true },
          });
        }
        return new Response("missing", { status: 404 });
      }),
    );

    renderReport();
    await screen.findByRole("heading", { name: /Changes required/i });
    await user.click(screen.getByRole("button", { name: "Open evidence Screenshot" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Evidence is unavailable or has expired for this report.",
      );
    });
  });

  it("keeps verdict meaning available without relying on color alone", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        if (url.includes("/v1/reports/receipt_1") && !url.includes("/evidence/")) {
          return Response.json(bundle);
        }
        if (url.includes("/verify")) {
          return Response.json({
            receiptId: "receipt_1",
            valid: true,
            checks: { receiptHash: true },
          });
        }
        return new Response("missing", { status: 404 });
      }),
    );

    const { container } = renderReport();
    await screen.findByRole("heading", { name: /Changes required/i });

    expect(screen.getByText("!")).toBeInTheDocument();
    expect(screen.getByText(/CHANGES_REQUIRED/)).toBeInTheDocument();
    expect(
      await axe(container, { rules: { "color-contrast": { enabled: false } } }),
    ).toHaveNoViolations();
  });
});
