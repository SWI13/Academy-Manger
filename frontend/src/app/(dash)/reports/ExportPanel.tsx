"use client";

import { useEffect, useRef, useState } from "react";

import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { FormError } from "@/components/ui/Field";
import { Icon, Spinner } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { ReportExport } from "@/types";
import { useDict, useFill } from "@/components/LocaleProvider";

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
  const d = useDict();
  const t = useFill();
  const toast = useToast();
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
        if (next.status === "READY") {
          toast({
            tone: "ok",
            title: d.reports.exportReady,
            description: t(d.phrases.rowsExported, {
              count: formatNumber(next.row_count),
            }),
          });
        }
      } catch {
        clearInterval(timer);
        setError("Lost track of the export. Reload to see its state.");
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [waiting, job, toast, d, t]);

  async function queue() {
    setBusy(true);
    setError(null);
    polls.current = 0;
    try {
      setJob(
        await api.post<ReportExport>(`/reports/${report}/export`, { filters }),
      );
    } catch (failure) {
      setError(
        failure instanceof ApiFailure
          ? failure.message
          : d.ui.serverUnreachable,
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
          : d.payments.downloadFailed,
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title={d.reports.export}
        icon="download"
        description={d.reports.exportNote}
        divider
        className="mb-4"
        action={
          <Button
            icon="download"
            busy={busy}
            onClick={queue}
            disabled={waiting}
          >
            {job ? d.reports.exportAgain : d.reports.exportCsv}
          </Button>
        }
      />

      {job ? (
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={job.status} />

          {waiting ? (
            <span className="flex items-center gap-2 text-sm text-ink-soft">
              <Spinner size={13} />{d.reports.exportBuilding}</span>
          ) : null}

          {job.status === "READY" ? (
            <>
              <span className="tabular text-sm text-ink-soft">
                {formatNumber(job.row_count)} rows ·{" "}
                {formatDateTime(job.finished_at)}
              </span>
              <Button variant="primary" icon="download" onClick={download}>{d.reports.exportDownload}</Button>
            </>
          ) : null}

          {job.status === "FAILED" ? (
            <span className="text-sm text-bad">
              {job.error || "The export failed."}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-[13px] text-ink-faint">{d.reports.exportNothingQueued}</p>
      )}

      {error ? (
        <div className="mt-4">
          <FormError>{error}</FormError>
        </div>
      ) : null}

      {job?.status === "READY" ? (
        <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-4 text-xs leading-relaxed text-ink-faint">
          <Badge tone="info" size="sm">
            <Icon name="lock" size={11} />{d.reports.exportPrivate}</Badge>
          The file is yours alone — nobody else can download it, the owner
          included. The link expires in seconds, and who fetched it is recorded.
        </p>
      ) : null}
    </Card>
  );
}
