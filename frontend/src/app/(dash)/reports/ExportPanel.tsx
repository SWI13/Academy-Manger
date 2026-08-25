"use client";

import { useEffect, useRef, useState } from "react";

import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ApiFailure, api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { ReportExport } from "@/types";

/**
 * Queue a CSV, wait for it, fetch it.
 *
 * The export is a job because a term's outstanding-balance query would hold a
 * request open long enough to hand the browser a timeout instead of a
 * spreadsheet. So: POST returns a job, this polls it, and the download is a
 * signed URL valid for seconds.
 *
 * Polling stops as soon as the job is terminal, and stops regardless after a
 * ceiling - a page left open on a broken job should not keep asking forever.
 */
const POLL_MS = 2000;
const MAX_POLLS = 60; // two minutes

export function ExportPanel({
  report,
  filters,
}: {
  report: string;
  filters: Record<string, string>;
}) {
  const [job, setJob] = useState<ReportExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const polls = useRef(0);

  const waiting =
    job !== null && (job.status === "PENDING" || job.status === "RUNNING");

  useEffect(() => {
    if (!waiting || !job) return;

    const timer = setInterval(async () => {
      polls.current += 1;
      if (polls.current > MAX_POLLS) {
        clearInterval(timer);
        setError("The export is taking longer than expected. Check back later.");
        return;
      }
      try {
        const next = await api.get<ReportExport>(`/exports/${job.public_id}`);
        setJob(next);
      } catch {
        clearInterval(timer);
        setError("Lost track of the export. Reload to see its state.");
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [waiting, job]);

  async function queue() {
    setBusy(true);
    setError(null);
    polls.current = 0;
    try {
      setJob(await api.post<ReportExport>(`/reports/${report}/export`, { filters }));
    } catch (failure) {
      setError(
        failure instanceof ApiFailure
          ? failure.message
          : "Could not reach the server.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!job) return;
    setError(null);
    try {
      const { url } = await api.get<{ url: string }>(
        `/exports/${job.public_id}/download`,
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (failure) {
      setError(
        failure instanceof ApiFailure
          ? failure.message
          : "Could not prepare the download.",
      );
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button busy={busy} onClick={queue}>
        {job ? "Export again" : "Export CSV"}
      </Button>

      {job ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={job.status} />
          {waiting ? (
            <span className="text-ink-soft">Building the file…</span>
          ) : null}
          {job.status === "READY" ? (
            <>
              <span className="tabular text-ink-soft">
                {formatNumber(job.row_count)} rows ·{" "}
                {formatDateTime(job.finished_at)}
              </span>
              <Button variant="primary" onClick={download}>
                Download
              </Button>
            </>
          ) : null}
          {job.status === "FAILED" ? (
            <span className="text-bad">{job.error || "The export failed."}</span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}

      {job?.status === "READY" ? (
        <p className="basis-full text-xs text-ink-faint">
          <Badge tone="info">Private</Badge> The file is yours alone — nobody
          else can download it, the owner included. The link expires in
          seconds, and who fetched it is recorded.
        </p>
      ) : null}
    </div>
  );
}
