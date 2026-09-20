"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useCan } from "@/components/SessionProvider";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { PaymentProof } from "@/types";
import { useDict, useFill } from "@/components/LocaleProvider";

/**
 * Bank slips and receipts.
 *
 * The bucket is private and there is no URL to a proof sitting in this page.
 * Asking for one calls the API, which signs a URL valid for seconds and
 * records who asked - a scan of a family's bank statement is worth knowing
 * the readers of. So the button opens the file rather than an anchor pointing
 * at it.
 *
 * Uploading is the same idea in reverse: the API signs a policy, the bytes go
 * straight from the browser to the object store, and the API is then told to
 * check what actually landed there. Nothing large passes through Django, and
 * the row is written from the object's own headers rather than from what the
 * browser claimed about it.
 */

const ACCEPTED = "image/jpeg,image/png,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;

type UploadPolicy = {
  storage_key: string;
  upload: { url: string; fields: Record<string, string> };
};

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function glyphFor(mime: string) {
  return mime === "application/pdf" ? "file" : "eye";
}

export function ProofList({
  proofs,
  publicId,
}: {
  proofs: PaymentProof[];
  publicId: string;
}) {
  const d = useDict();
  const t = useFill();
  const router = useRouter();
  const can = useCan();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mayUpload = can("proof.upload");

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
          : d.payments.downloadFailed,
      );
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setError(null);

    // Checked here so a 10MB photo does not travel before being refused, and
    // checked again by the storage service, which is where it counts: the
    // ceiling is bound into the signature.
    if (file.size > MAX_BYTES) {
      setError(
        t(d.phrases.overSizeLimit, { size: readableSize(file.size) }),
      );
      return;
    }

    setUploading(true);
    try {
      const policy = await api.post<UploadPolicy>(
        `/payments/${publicId}/proofs/upload-url`,
        {
          filename: file.name,
          content_type: file.type,
          size_bytes: file.size,
        },
      );

      // Straight to the object store, not through the API. The fields are the
      // signed policy and must be appended before the file itself.
      const form = new FormData();
      for (const [key, value] of Object.entries(policy.upload.fields)) {
        form.append(key, value);
      }
      form.append("file", file);

      const stored = await fetch(policy.upload.url, {
        method: "POST",
        body: form,
      });
      if (!stored.ok) {
        throw new Error("The file was refused by the storage service.");
      }

      await api.post(`/payments/${publicId}/proofs/confirm`, {
        storage_key: policy.storage_key,
        filename: file.name,
      });

      toast({
        tone: "ok",
        title: d.payments.proofAttached,
        description: d.payments.proofScanNote,
      });
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof ApiFailure
          ? failure.message
          : failure instanceof Error
            ? failure.message
            : d.payments.uploadIncomplete,
      );
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {proofs.length ? (
        <ul className="flex flex-col gap-2">
          {proofs.map((proof) => (
            <li
              key={proof.id}
              className="flex items-center gap-3 rounded-lg border border-rule p-2.5"
            >
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-rule bg-white/[0.06] text-ink-faint"
              >
                <Icon name={glyphFor(proof.mime_type)} size={16} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">
                  {proof.original_filename}
                </p>
                <p className="tabular truncate text-xs text-ink-faint">
                  {readableSize(proof.size_bytes)} ·{" "}
                  {formatDateTime(proof.uploaded_at)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {proof.is_viewable ? (
                  <Badge tone="ok" size="sm">{d.payments.scanned}</Badge>
                ) : (
                  <StatusBadge status={proof.scan_status} size="sm" />
                )}
                <Button
                  size="sm"
                  busy={busy === proof.id}
                  disabled={!proof.is_viewable}
                  title={
                    proof.is_viewable
                      ? undefined
                      : d.payments.scanning
                  }
                  onClick={() => open(proof)}
                >
                  Open
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-rule px-3 py-6 text-center text-[13px] text-ink-soft">{d.payments.noProof}</p>
      )}

      {mayUpload ? (
        <>
          <input
            ref={input}
            type="file"
            accept={ACCEPTED}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            icon="upload"
            block
            busy={uploading}
            onClick={() => input.current?.click()}
          >
            {uploading ? d.payments.uploading : d.payments.attachProof}
          </Button>
          <p className="text-xs leading-relaxed text-ink-faint">
            JPEG, PNG or PDF, up to 10 MB. The file goes straight to private
            storage and is scanned before anyone can open it.
          </p>
        </>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}
    </div>
  );
}
