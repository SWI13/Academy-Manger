import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, StatusBadge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card, SectionHeader } from "@/components/ui/Card";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Meter } from "@/components/ui/Stars";
import { Figure } from "@/components/ui/StatTile";
import { getJson } from "@/lib/django";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Assessment, Course, Schedule } from "@/types";

import { WeekGrid } from "../../schedules/WeekGrid";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `${(await params).publicId}` };
}

export default async function CoursePage({ params }: Props) {
  const { publicId } = await params;
  const cookie = await cookieHeader();

  const course = await getJson<Course>(`/api/v1/courses/${publicId}/`, cookie);
  if (!course) notFound();

  const session = await getSession();
  const showsPrice = can(session, "payment.view");
  const showsMarks = can(session, "assessment.view");
  // Anyone who reaches more than their own row: staff and professors.
  const seesTheClass =
    can(session, "enrollment.create") || can(session, "score.enter");

  // Fetched only for callers who hold the permission, rather than fetched and
  // then hidden. An unauthorized request that returns null is still a request.
  const [schedules, assessments] = await Promise.all([
    can(session, "schedule.view")
      ? getJson<{ results: Schedule[] }>(
          `/api/v1/schedules/?course=${course.public_id}`,
          cookie,
        )
      : null,
    showsMarks
      ? getJson<{ results: Assessment[] }>(
          `/api/v1/assessments/?course=${course.public_id}`,
          cookie,
        )
      : null,
  ]);

  const professors = course.professors;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/courses", label: "Courses" }}
        title={course.title}
        eyebrow={
          <span className="tabular">
            {course.public_id} · {formatDate(course.start_date)} —{" "}
            {formatDate(course.end_date)}
          </span>
        }
        badge={<StatusBadge status={course.status} />}
        actions={
          <>
            {can(session, "enrollment.view") ? (
              <LinkButton
                href={`/enrollments?course=${course.public_id}`}
                icon="graduation"
              >
                {seesTheClass
                  ? `Class list (${formatNumber(course.seats_taken)})`
                  : "Your enrolment"}
              </LinkButton>
            ) : null}
            {can(session, "score.view") ? (
              <LinkButton
                href={`/grades?course=${course.public_id}`}
                icon="check-circle"
              >
                {seesTheClass ? "Gradebook" : "Your marks"}
              </LinkButton>
            ) : null}
            {showsPrice ? (
              <LinkButton
                href={`/payments?course=${course.public_id}`}
                icon="wallet"
              >
                Payments
              </LinkButton>
            ) : null}
          </>
        }
      />

      {/* --- the figures that describe the course itself --------------- */}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <DescriptionList
            items={[
              {
                label: "Runs",
                value: (
                  <span className="tabular">
                    {formatDate(course.start_date)} — {formatDate(course.end_date)}
                  </span>
                ),
              },
              {
                label: "Taught by",
                value: professors.length ? (
                  <ul className="flex flex-col gap-1">
                    {professors.map((assignment) => (
                      <li key={assignment.id}>
                        {assignment.professor.full_name}{" "}
                        <span className="tabular text-ink-faint">
                          {assignment.professor.public_id}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-ink-faint">Unassigned</span>
                ),
              },
              course.description
                ? { label: "About", value: course.description, wide: true }
                : null,
            ]}
          />
        </Card>

        <Card className="flex flex-col gap-5">
          <div>
            <p className="eyebrow">Seats</p>
            <p className="tabular mt-2 text-2xl font-semibold text-ink">
              {formatNumber(course.seats_taken)}
              {course.capacity ? (
                <span className="text-base font-medium text-ink-faint">
                  {" "}
                  / {formatNumber(course.capacity)}
                </span>
              ) : null}
            </p>
            {course.capacity ? (
              <>
                <Meter
                  value={course.seats_taken}
                  max={course.capacity}
                  tone={course.seats_taken >= course.capacity ? "warn" : "accent"}
                  label={`${course.seats_taken} of ${course.capacity} seats taken`}
                  className="mt-3"
                />
                <p className="mt-2 text-xs text-ink-faint">
                  {course.seats_taken >= course.capacity
                    ? "Full."
                    : `${formatNumber(course.capacity - course.seats_taken)} left`}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-ink-faint">Uncapped</p>
            )}
          </div>

          {showsPrice ? (
            <div className="border-t border-rule pt-4">
              <Figure
                label="Price"
                value={formatMoney(course.price_minor, course.currency)}
                note="Frozen onto each enrolment as it is made"
              />
            </div>
          ) : null}
        </Card>
      </div>

      {/* --- the week ------------------------------------------------- */}
      {schedules ? (
        <section>
          <SectionHeader
            title="Weekly schedule"
            description="A recurring pattern, not a diary of dated sessions."
            action={
              <Link
                href={`/schedules?course=${course.public_id}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                Full timetable
                <Icon name="arrow-right" size={14} />
              </Link>
            }
          />
          <WeekGrid slots={schedules.results} showCourse={false} />
        </section>
      ) : null}

      {/* --- assessments ---------------------------------------------- */}
      {assessments ? (
        <section>
          <SectionHeader
            title="Assessments"
            description={
              seesTheClass
                ? "Each carries a weight, which is its share of the course average."
                : "Only published assessments show a mark."
            }
          />
          {assessments.results.length ? (
            <ul className="flex flex-col gap-2">
              {assessments.results.map((assessment) => (
                <li key={assessment.id}>
                  <Link
                    href={`/grades/${assessment.id}`}
                    className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-surface px-4 py-3 shadow-xs transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink transition-colors group-hover:text-accent">
                        {assessment.title}
                      </p>
                      <p className="tabular mt-0.5 text-xs text-ink-faint">
                        out of {assessment.max_score} · weight {assessment.weight}
                        {assessment.held_on
                          ? ` · ${formatDate(assessment.held_on)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="tabular text-xs text-ink-faint">
                        {formatNumber(assessment.marked_count)} marked
                      </span>
                      {assessment.is_published ? (
                        <Badge tone="ok" dot>
                          Published
                        </Badge>
                      ) : (
                        <Badge tone="warn" dot>
                          Not published
                        </Badge>
                      )}
                      <Icon
                        name="chevron-right"
                        size={16}
                        className="text-ink-faint transition-transform group-hover:translate-x-0.5"
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="check-circle"
              title="No assessments yet"
              description="Marks and averages appear here once an assessment exists on this course."
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
