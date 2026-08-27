import { Card, SectionHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, NoAccess } from "@/components/ui/EmptyState";
import { Note } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Stars } from "@/components/ui/Stars";
import { Toolbar } from "@/components/ui/Toolbar";
import { getJson } from "@/lib/django";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Enrollment, Review } from "@/types";

import { ReviewCard } from "./ReviewCard";
import { WriteReview } from "./WriteReview";

export const metadata = { title: "Reviews" };

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

  // Reception holds no review permission - the feedback channel is not part
  // of the desk's work - so the list would come back 403.
  if (!can(session, "review.view")) return <NoAccess what="Reviews" />;

  if (!page) {
    return <ErrorState title="Reviews could not be loaded" />;
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
  const alreadyReviewed = new Set(
    page.results.map((review) => review.enrollment),
  );
  const options = (reviewable?.results ?? []).filter(
    (row) => !alreadyReviewed.has(row.id),
  );
  const pending = page.results.filter((review) => review.status === "PENDING");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reviews"
        lede={
          mayModerate
            ? "Written by students who finished a course. Nothing is deleted — hiding or rejecting keeps the row, the decision and who made it."
            : "What students said about the courses you can see. Approved reviews only, and never with the author’s name attached for a professor."
        }
      />

      {mayWrite ? <WriteReview options={options} /> : null}

      {summary?.length ? (
        <section>
          <SectionHeader
            title="By course"
            description="Approved reviews only, worked out on read. A stored average could not be re-derived once a review is hidden."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {summary.map((row) => (
              <Card key={row.course_public_id} as="div">
                <p className="truncate text-sm font-medium text-ink">
                  {row.course_title}
                </p>
                <p className="tabular truncate text-xs text-ink-faint">
                  {row.course_public_id}
                </p>

                {row.average_rating === null ? (
                  <p className="mt-3 text-sm text-ink-faint">No reviews yet</p>
                ) : (
                  <>
                    <div className="mt-3 flex items-baseline gap-2.5">
                      <span className="tabular text-2xl font-semibold text-ink">
                        {row.average_rating.toFixed(2)}
                      </span>
                      <Stars
                        rating={Math.round(row.average_rating)}
                        showValue={false}
                      />
                    </div>
                    <p className="mt-1 text-xs text-ink-faint">
                      over {row.review_count}{" "}
                      {row.review_count === 1 ? "review" : "reviews"}
                    </p>
                  </>
                )}
              </Card>
            ))}
          </div>
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
        <Note tone="warn">
          {pending.length} on this page {pending.length === 1 ? "is" : "are"}{" "}
          waiting for a decision.
        </Note>
      ) : null}

      <section className="flex flex-col gap-3">
        {page.results.length ? (
          page.results.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))
        ) : (
          <EmptyState
            icon="star"
            title={
              mayModerate ? "Nothing to moderate" : "No reviews here yet"
            }
            description={
              mayModerate
                ? "You are all caught up. New reviews arrive as students finish their courses."
                : "A review appears once a student has finished a course and a moderator has approved what they wrote."
            }
            tone={mayModerate ? "ok" : "neutral"}
          />
        )}
      </section>

      <Pagination
        count={page.count}
        page={pageFrom(params)}
        pageSize={PAGE_SIZE}
        unit="review"
      />
    </div>
  );
}
