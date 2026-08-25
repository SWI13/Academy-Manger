"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCan, useSession } from "@/components/SessionProvider";
import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormError, TextArea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Stars } from "@/components/ui/Stars";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Review } from "@/types";

/**
 * One review, and whatever this reader is allowed to do with it.
 *
 * The author's name is simply not in the payload for a professor - the
 * serializer omits it, so there is nothing here to hide and nothing in the
 * network tab to find. A professor enters the marks of the student who wrote
 * this; knowing who gave two stars would make the feedback channel return
 * nothing but fives.
 *
 * Rejecting is the destructive one and goes through a dialog. Approving and
 * hiding are reversible by a later decision, so they act directly - a
 * confirmation on every button is a confirmation nobody reads.
 */
export function ReviewCard({ review }: { review: Review }) {
  const router = useRouter();
  const can = useCan();
  const session = useSession();
  const toast = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [response, setResponse] = useState(review.admin_response ?? "");
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mayModerate = can("review.moderate");
  const isMine = review.student_public_id === session.public_id;
  const editable = isMine && review.status === "PENDING";

  async function moderate(status: string) {
    setBusy(status);
    setError(null);
    try {
      await api.post(`/reviews/${review.id}/moderate`, {
        status,
        admin_response: response.trim(),
      });
      setOpen(false);
      setRejecting(false);
      toast({
        tone: status === "APPROVED" ? "ok" : "info",
        title:
          status === "APPROVED"
            ? "Review approved"
            : status === "HIDDEN"
              ? "Review hidden"
              : "Review rejected",
        description: "The row, the decision and who made it are all kept.",
      });
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof ApiFailure
          ? failure.message
          : "Could not reach the server.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-xl border border-rule bg-surface p-4 shadow-xs sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {/*
            Anonymous where the API said so. A professor gets no name field at
            all, so there is no initial to draw and the mark stands in for one.
          */}
          {review.student_name ? (
            <Avatar
              name={review.student_name}
              seed={review.student_public_id}
              size="md"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sunk text-ink-faint"
            >
              <Icon name="user" size={16} />
            </span>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <Stars rating={review.rating} />
            </div>
            <p className="mt-1 truncate text-sm text-ink-soft">
              {review.course_title}{" "}
              <span className="tabular text-ink-faint">
                {review.course_public_id}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-ink-faint">
              {review.student_name ? `${review.student_name} · ` : "Anonymous · "}
              {formatDate(review.created_at)}
            </p>
          </div>
        </div>

        <StatusBadge status={review.status} />
      </header>

      {review.comment ? (
        <blockquote className="mt-4 border-l-2 border-rule pl-3.5 text-sm leading-relaxed text-ink">
          {review.comment}
        </blockquote>
      ) : (
        <p className="mt-4 text-sm italic text-ink-faint">No comment left.</p>
      )}

      {review.admin_response ? (
        <div className="mt-4 rounded-lg border border-accent-line bg-accent-soft px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.055em] text-accent">
            <Icon name="mail" size={13} />
            Reply from the institute
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">
            {review.admin_response}
          </p>
        </div>
      ) : null}

      {editable ? (
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
          <Icon name="clock" size={14} className="mt-px shrink-0" />
          Waiting for moderation. You can still change it until someone rules on
          it — after that the text is fixed.
        </p>
      ) : null}

      {mayModerate ? (
        <div className="mt-4 border-t border-rule pt-4">
          {open ? (
            <div className="flex flex-col gap-3">
              <TextArea
                label="Public reply"
                optional
                rows={2}
                value={response}
                onChange={(event) => setResponse(event.target.value)}
                placeholder="Published alongside the review if you approve it."
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon="check"
                  busy={busy === "APPROVED"}
                  onClick={() => moderate("APPROVED")}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  icon="eye"
                  busy={busy === "HIDDEN"}
                  onClick={() => moderate("HIDDEN")}
                >
                  Hide
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon="close"
                  onClick={() => setRejecting(true)}
                >
                  Reject
                </Button>
                <Button variant="quiet" size="sm" onClick={() => setOpen(false)}>
                  Back
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-ink-faint">
                Hidden and rejected keep the row, the decision and who made it.
                Nothing here is ever deleted — a moderation decision nobody can
                inspect afterwards is not moderation.
              </p>
            </div>
          ) : (
            <Button size="sm" icon="shield" onClick={() => setOpen(true)}>
              {review.status === "PENDING" ? "Moderate" : "Change decision"}
            </Button>
          )}

          {error ? (
            <div className="mt-3">
              <FormError>{error}</FormError>
            </div>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        onConfirm={() => moderate("REJECTED")}
        busy={busy === "REJECTED"}
        tone="danger"
        icon="close"
        title="Reject this review?"
        confirmLabel="Reject review"
        description="It stays in the record with your decision against it, and never appears publicly."
      >
        <blockquote className="rounded-lg border border-rule bg-sunk/60 p-3 text-sm leading-relaxed text-ink-soft">
          {review.comment || "No comment left."}
        </blockquote>
      </ConfirmDialog>
    </article>
  );
}
