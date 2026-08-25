"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { FormError, Select, TextArea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
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
  const toast = useToast();
  const [enrollment, setEnrollment] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!options.length) {
    return (
      <Card>
        <p className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
          <Icon name="star" size={16} className="mt-0.5 shrink-0 text-ink-faint" />
          You can review a course once it is complete. Nothing of yours is
          finished and unreviewed just now.
        </p>
      </Card>
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
      toast({
        tone: "ok",
        title: "Review submitted",
        description: "A moderator reads it before anyone else sees it.",
      });
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
    <Card as="div">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <CardHeader
          title="Review a course"
          icon="star"
          description="Your professor never learns who wrote it."
          divider
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Course"
            required
            value={enrollment}
            onChange={(event) => setEnrollment(event.target.value)}
            placeholder="Choose one"
            options={options.map((row) => ({
              value: String(row.id),
              label: `${row.course_title} (${row.course_public_id})`,
            }))}
          />

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink">Rating</span>
            <div
              role="radiogroup"
              aria-label="Rating"
              className="flex h-9 items-center gap-1"
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={rating === star}
                  aria-label={`${star} out of 5`}
                  onClick={() => setRating(star)}
                  className="rounded p-0.5 transition-transform hover:scale-110"
                >
                  <svg
                    width={24}
                    height={24}
                    viewBox="0 0 24 24"
                    className={star <= rating ? "text-warn" : "text-rule-strong"}
                    fill={star <= rating ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinejoin="round"
                  >
                    <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.8l6.5-.9L12 3Z" />
                  </svg>
                </button>
              ))}
              <span className="tabular ml-1.5 text-sm text-ink-soft">
                {rating}/5
              </span>
            </div>
          </div>

          <TextArea
            label="Comment"
            optional
            rows={3}
            maxLength={4000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="What was good, what could be better."
            wrapperClassName="sm:col-span-2"
          />
        </div>

        {error ? <FormError>{error}</FormError> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            icon="check"
            busy={busy}
            disabled={!enrollment}
          >
            Submit review
          </Button>
          <p className="text-[13px] text-ink-faint">
            It is read by a moderator before anyone else sees it. You can change
            it until then.
          </p>
        </div>
      </form>
    </Card>
  );
}
