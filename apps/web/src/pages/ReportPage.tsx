import { buildReportView, type ReportView } from "@shipcheck/report-view";
import type { ReceiptVerificationResponse } from "@shipcheck/service-core";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiClientError } from "../api.js";
import { LimitationNotice } from "../components/LimitationNotice.js";
import { ReceiptFooter } from "../components/ReceiptFooter.js";
import { RequirementRows } from "../components/RequirementRows.js";
import { SummaryCounts } from "../components/SummaryCounts.js";
import { VerdictBanner } from "../components/VerdictBanner.js";
import {
  fetchEvidenceLink,
  fetchReceiptVerification,
  fetchReportBundle,
} from "../report-api.js";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string; readonly code: string }
  | {
      readonly status: "ready";
      readonly view: ReportView;
      readonly verification: ReceiptVerificationResponse | null;
    };

export function ReportPage() {
  const { receiptId = "" } = useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [openingEvidenceId, setOpeningEvidenceId] = useState<string | null>(
    null,
  );
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setEvidenceError(null);

    async function load(): Promise<void> {
      try {
        const [bundle, verification] = await Promise.all([
          fetchReportBundle(receiptId),
          fetchReceiptVerification(receiptId).catch(() => null),
        ]);
        if (cancelled) {
          return;
        }
        setState({
          status: "ready",
          view: buildReportView(bundle),
          verification,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiClientError) {
          setState({
            status: "error",
            code: error.code,
            message: error.message,
          });
          return;
        }
        setState({
          status: "error",
          code: "INTERNAL_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to load report",
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [receiptId]);

  const evidenceById = useMemo(() => {
    if (state.status !== "ready") {
      return new Map();
    }
    return new Map(
      state.view.evidence.map((artifact) => [artifact.evidenceId, artifact]),
    );
  }, [state]);

  async function openEvidence(evidenceId: string): Promise<void> {
    setOpeningEvidenceId(evidenceId);
    setEvidenceError(null);
    try {
      const link = await fetchEvidenceLink(receiptId, evidenceId);
      const expiresAt = Date.parse(link.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        setEvidenceError(
          "This evidence link has expired. Request a fresh link to continue.",
        );
        return;
      }
      window.open(link.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        setEvidenceError(
          "Evidence is unavailable or has expired for this report.",
        );
        return;
      }
      setEvidenceError(
        error instanceof Error
          ? error.message
          : "Unable to open evidence artifact",
      );
    } finally {
      setOpeningEvidenceId(null);
    }
  }

  return (
    <main className="page report">
      <p className="report__nav">
        <Link to="/" aria-label="Back to ShipCheck home">
          ShipCheck
        </Link>
      </p>

      {state.status === "loading" ? (
        <p role="status" aria-live="polite">
          Loading report…
        </p>
      ) : null}

      {state.status === "error" ? (
        <section
          className="report__error"
          role="alert"
          aria-labelledby="report-error-heading"
        >
          <h1 id="report-error-heading">
            {state.code === "NOT_FOUND"
              ? "Report not found"
              : "Unable to load report"}
          </h1>
          <p>{state.message}</p>
          {state.code === "NOT_FOUND" ? (
            <p>
              Reports are unlisted and may expire after retention. Confirm the
              receipt ID from the verify response.
            </p>
          ) : null}
        </section>
      ) : null}

      {state.status === "ready" ? (
        <>
          <VerdictBanner verdict={state.view.verdict} />
          <SummaryCounts summary={state.view.summary} />
          <RequirementRows
            requirements={state.view.requirements}
            evidenceById={evidenceById}
            openingEvidenceId={openingEvidenceId}
            onOpenEvidence={(evidenceId) => {
              void openEvidence(evidenceId);
            }}
          />
          {evidenceError !== null ? (
            <p className="report__evidence-error" role="alert">
              {evidenceError}
            </p>
          ) : null}
          <ReceiptFooter
            receiptId={state.view.receiptId}
            receiptHash={state.view.receiptHash}
            target={state.view.target}
            testedAt={state.view.testedAt}
            verification={state.verification}
          />
          <LimitationNotice notice={state.view.limitationNotice} />
        </>
      ) : null}
    </main>
  );
}
