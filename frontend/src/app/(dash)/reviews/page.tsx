import { Toolbar } from "@/components/ui/Toolbar";
import { Stars } from "@/components/ui/Stars";
import { getJson } from "@/lib/django";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { can, cookieHeader, getSession } from "@/lib/session";
import { Pagination } from "@/components/ui/Pagination";
import type { Enrollment, Review } from "@/types";

import { ReviewCard } from "./ReviewCard";
import { WriteReview } from "./WriteReview";

export const metadata = { title: "Reviews · SM Academy" };

const FILTERS = ["status", "course", "rating"];

type Summary = {
  course_public_id: string;
  course_title: string;
  review_count: number;
  average_rating: number | null;
  distribution: Record<string, number>;
};

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const cookie = await cookieHeader();

  const [page, session, summary] = await Promise.all([
    fetchPage<Review>("reviews", params, FILTERS),
    getSession(),
    getJson<Summary[]>("/api/v1/reviews/summary/", cookie),
  ]);

  if (!page) {
    return (
      <p className="text-sm text-ink-soft">
        Reviews could not be loaded. Try refreshing.
      </p>
    );
  }

  const mayModerate = can(session, "review.moderate");
  const mayWrite = can(session, "review.create");

  // Completed enrolments the caller has not already reviewed. Resolved here
  // rather than in the form, so the box arrives with its options rather than
  // filling in after paint.
  const reviewable = mayWrite
    ? await getJson<{ results: Enrollment[] }>(
        "/api/v1/enrollments/?status=COMPLETED",
        cookie,
      )
    : null;
  const alreadyReviewed = new Set(page.results.map((review) => review.enrollment));
  const options = (reviewable?.results ?? []).filter(
    (row) => !alreadyReviewed.has(row.id),
  );
  const pending = page.results.filter((review) => review.status === "PENDING");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Reviews</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {mayModerate
            ? "Written by students who finished a course. Nothing is deleted — hiding or rejecting keeps the row, the decision and who made it."
            : "What students said about the courses you can see. Approved reviews only."}
        </p>
      </header>

      {mayWrite ? <WriteReview options={options} /> : null}

      {summary?.length ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            By course
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.map((row) => (
              <div
                key={row.course_public_id}
                className="rounded border border-rule bg-surface p-3"
              >
                <p className="text-sm font-medium text-ink">{row.course_title}</p>
                <p className="tabular text-xs text-ink-faint">
                  {row.course_public_id}
                </p>
                <div className="mt-2">
                  {row.average_rating === null ? (
                    <p className="text-sm text-ink-faint">No reviews yet</p>
                  ) : (
                    <>
                      <Stars rating={Math.round(row.average_rating)} />
                      <p className="tabular mt-1 text-xs text-ink-soft">
                        {row.average_rating.toFixed(2)} average over{" "}
                        {row.review_count}{" "}
                        {row.review_count === 1 ? "review" : "reviews"}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            Approved reviews only, worked out on read. A stored average could
            not be re-derived once a review is hidden.
          </p>
        </section>
      ) : null}

      {mayModerate ? (
        <Toolbar
          filters={[
            {
              param: "status",
              label: "Status",
              options: [
                { value: "PENDING", label: "Awaiting moderation" },
                { value: "APPROVED", label: "Approved" },
                { value: "HIDDEN", label: "Hidden" },
                { value: "REJECTED", label: "Rejected" },
              ],
            },
            { param: "course", label: "Course", placeholder: "C-2026-001" },
            {
              param: "rating",
              label: "Rating",
              options: [5, 4, 3, 2, 1].map((star) => ({
                value: String(star),
                label: `${star} star${star === 1 ? "" : "s"}`,
              })),
            },
          ]}
        />
      ) : null}

      {mayModerate && pending.length ? (
        <p className="rounded border border-warn/25 bg-warn-wash px-3 py-2 text-sm text-warn">
          {pending.length} on this page {pending.length === 1 ? "is" : "are"}{" "}
          waiting for a decision.
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        {page.results.length ? (
          page.results.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))
        ) : (
          <p className="rounded border border-rule bg-surface px-4 py-10 text-center text-sm text-ink-soft">
            Nothing here yet.
          </p>
        )}
      </section>

      <Pagination
        count={page.count}
        page={pageFrom(params)}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
