"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ApiFailure, api } from "@/lib/api";
import type { Enrollment } from "@/types";

/**
 * Writing a review, for the courses that can actually be reviewed.
 *
 * The form offers completed enrolments only, because that is the rule the API
 * enforces (D-10) - a review written in week two is a review of the enrolment
 * process. Listing every enrolment and letting the student pick one that gets
 * refused would teach them the form is unreliable rather than that the rule
 * exists.
 *
 * Enrolments already reviewed drop out of the list too: one review per
 * attempt is a unique constraint, so offering it twice can only produce an
 * error.
 *
 * The options are resolved on the server and passed in, like every other list
 * in the app. Fetching them on mount would render an empty box first and fill
 * it a moment later, which on a slow connection reads as "there is nothing
 * you can review" right up until it does not.
 */
export function WriteReview({ options }: { options: Enrollment[] }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!options.length) {
    return (
      <p className="rounded border border-rule bg-surface px-3 py-2 text-sm text-ink-soft">
        You can review a course once it is complete. Nothing of yours is
        finished and unreviewed just now.
      </p>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/reviews", {
        enrollment_id: Number(enrollment),
        rating,
        comment: comment.trim(),
      });
      setComment("");
      setEnrollment("");
      // The server recomputes which enrolments are still reviewable, so the
      // one just used disappears from the list on its own.
      router.refresh();
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

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded border border-rule bg-surface p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
        Review a course
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Course</span>
          <select
            required
            value={enrollment}
            onChange={(event) => setEnrollment(event.target.value)}
            className="rounded border border-rule-strong bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">Choose one</option>
            {options.map((row) => (
              <option key={row.id} value={row.id}>
                {row.course_title} ({row.course_public_id})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Rating</span>
          <select
            value={rating}
            onChange={(event) => setRating(Number(event.target.value))}
            className="rounded border border-rule-strong bg-surface px-3 py-2 text-sm text-ink"
          >
            {[5, 4, 3, 2, 1].map((star) => (
              <option key={star} value={star}>
                {"★".repeat(star)} — {star}/5
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Comment</span>
        <textarea
          rows={3}
          maxLength={4000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="rounded border border-rule-strong bg-surface px-3 py-2 text-sm text-ink"
          placeholder="What was good, what could be better."
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" busy={busy} disabled={!enrollment}>
          Submit review
        </Button>
        <p className="text-xs text-ink-faint">
          It is read by a moderator before anyone else sees it. You can change
          it until then.
        </p>
      </div>
    </form>
  );
}
