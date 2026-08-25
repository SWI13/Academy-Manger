"use client";

import { useState } from "react";

import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ApiFailure, api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { PaymentProof } from "@/types";

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Bank slips and receipts.
 *
 * The bucket is private and there is no URL to a proof sitting in this page.
 * Asking for one calls the API, which signs a URL valid for seconds and
 * records who asked - a scan of a family's bank statement is worth knowing
 * the readers of. So the button opens the file rather than an anchor
 * pointing at it.
 */
export function ProofList({ proofs }: { proofs: PaymentProof[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!proofs.length) {
    return (
      <p className="text-sm text-ink-soft">
        No proof attached. Cash taken at the desk normally has none.
      </p>
    );
  }

  async function open(proof: PaymentProof) {
    setBusy(proof.id);
    setError(null);
    try {
      const { url } = await api.get<{ url: string }>(
        `/proofs/${proof.id}/download`,
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (failure) {
      setError(
        failure instanceof ApiFailure
          ? failure.message
          : "Could not prepare the download.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {proofs.map((proof) => (
          <li
            key={proof.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded border border-rule px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">
                {proof.original_filename}
              </p>
              <p className="tabular text-xs text-ink-faint">
                {readableSize(proof.size_bytes)} ·{" "}
                {formatDateTime(proof.uploaded_at)}
                {proof.uploaded_by_public_id
                  ? ` · ${proof.uploaded_by_public_id}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {proof.is_viewable ? (
                <Badge tone="ok">Scanned</Badge>
              ) : (
                <StatusBadge status={proof.scan_status} />
              )}
              <Button
                busy={busy === proof.id}
                disabled={!proof.is_viewable}
                title={
                  proof.is_viewable
                    ? undefined
                    : "Still being checked. A file is not handed out before it is scanned."
                }
                onClick={() => open(proof)}
              >
                Open
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}
