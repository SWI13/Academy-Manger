"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCan, useSession } from "@/components/SessionProvider";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Stars } from "@/components/ui/Stars";
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
 */
export function ReviewCard({ review }: { review: Review }) {
  const router = useRouter();
  const can = useCan();
  const session = useSession();

  const [busy, setBusy] = useState<string | null>(null);
  const [response, setResponse] = useState(review.admin_response ?? "");
  const [open, setOpen] = useState(false);
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
    <article className="rounded border border-rule bg-surface p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Stars rating={review.rating} />
          <p className="mt-1 text-sm text-ink-soft">
            {review.course_title}{" "}
            <span className="tabular text-ink-faint">
              {review.course_public_id}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {/*
              Absent for a professor. Rendered only when the API sent it,
              rather than checked for here - the decision belongs upstream.
            */}
            {review.student_name ? `${review.student_name} · ` : ""}
            {formatDate(review.created_at)}
          </p>
        </div>
        <StatusBadge status={review.status} />
      </header>

      {review.comment ? (
        <p className="mt-3 whitespace-pre-line text-sm text-ink">
          {review.comment}
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink-faint">No comment left.</p>
      )}

      {review.admin_response ? (
        <div className="mt-3 rounded border border-accent/25 bg-accent-soft px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            Reply from the institute
          </p>
          <p className="mt-1 text-sm text-ink">{review.admin_response}</p>
        </div>
      ) : null}

      {editable ? (
        <p className="mt-3 text-xs text-ink-faint">
          Waiting for moderation. You can still change it until someone rules
          on it — after that the text is fixed.
        </p>
      ) : null}

      {mayModerate ? (
        <div className="mt-4 border-t border-rule pt-3">
          {open ? (
            <div className="flex flex-col gap-2">
              <label
                htmlFor={`reply-${review.id}`}
                className="text-sm font-medium text-ink"
              >
                Public reply (optional)
              </label>
              <textarea
                id={`reply-${review.id}`}
                rows={2}
                value={response}
                onChange={(event) => setResponse(event.target.value)}
                className="rounded border border-rule-strong bg-surface px-3 py-2 text-sm text-ink"
                placeholder="Published alongside the review if you approve it."
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  busy={busy === "APPROVED"}
                  onClick={() => moderate("APPROVED")}
                >
                  Approve
                </Button>
                <Button busy={busy === "HIDDEN"} onClick={() => moderate("HIDDEN")}>
                  Hide
                </Button>
                <Button
                  variant="danger"
                  busy={busy === "REJECTED"}
                  onClick={() => moderate("REJECTED")}
                >
                  Reject
                </Button>
                <Button variant="quiet" onClick={() => setOpen(false)}>
                  Back
                </Button>
              </div>
              <p className="text-xs text-ink-faint">
                Hidden and rejected keep the row, the decision and who made it.
                Nothing here is ever deleted — a moderation decision nobody can
                inspect afterwards is not moderation.
              </p>
            </div>
          ) : (
            <Button onClick={() => setOpen(true)}>
              {review.status === "PENDING" ? "Moderate" : "Change decision"}
            </Button>
          )}

          {error ? (
            <p role="alert" className="mt-2 text-sm text-bad">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
