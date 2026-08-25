import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, StatusBadge } from "@/components/ui/Badge";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { getJson } from "@/lib/django";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Assessment, Course, Schedule } from "@/types";

import { WeekGrid } from "../../schedules/WeekGrid";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `${(await params).publicId} · SM Academy` };
}

export default async function CoursePage({ params }: Props) {
  const { publicId } = await params;
  const cookie = await cookieHeader();

  const course = await getJson<Course>(
    `/api/v1/courses/${publicId}/`,
    cookie,
  );
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/courses" className="text-sm text-ink-soft hover:text-ink">
            ← Courses
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">
            {course.title}
          </h1>
          <p className="tabular mt-1 text-sm text-ink-soft">
            {course.public_id}
          </p>
        </div>
        <StatusBadge status={course.status} />
      </header>

      <section className="rounded border border-rule bg-surface p-4">
        <DescriptionList
          items={[
            {
              label: "Runs",
              value: `${formatDate(course.start_date)} — ${formatDate(course.end_date)}`,
            },
            {
              label: "Seats",
              value: course.capacity
                ? `${formatNumber(course.seats_taken)} of ${formatNumber(course.capacity)} taken`
                : `${formatNumber(course.seats_taken)} enrolled, uncapped`,
            },
            showsPrice
              ? {
                  label: "Price",
                  value: formatMoney(course.price_minor, course.currency),
                }
              : null,
            {
              label: "Taught by",
              value: course.professors.length ? (
                <ul>
                  {course.professors.map((assignment) => (
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
              ? { label: "About", value: course.description }
              : null,
          ]}
        />

        {/*
          Labels follow the permission, not the route. A student following
          "Class list" reaches a page containing one row - their own - and a
          link that promised a roster and delivered a mirror is a link that
          teaches people the navigation lies to them.
        */}
        <div className="mt-4 flex flex-wrap gap-3 border-t border-rule pt-4 text-sm">
          {can(session, "enrollment.view") ? (
            <Link
              href={`/enrollments?course=${course.public_id}`}
              className="text-accent hover:underline"
            >
              {seesTheClass
                ? `Class list (${formatNumber(course.seats_taken)})`
                : "Your enrolment"}
            </Link>
          ) : null}
          {can(session, "score.view") ? (
            <Link
              href={`/grades?course=${course.public_id}`}
              className="text-accent hover:underline"
            >
              {seesTheClass ? "Gradebook" : "Your marks"}
            </Link>
          ) : null}
          {can(session, "payment.view") ? (
            <Link
              href={`/payments?course=${course.public_id}`}
              className="text-accent hover:underline"
            >
              Payments
            </Link>
          ) : null}
        </div>
      </section>

      {schedules ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Weekly schedule
          </h2>
          <WeekGrid slots={schedules.results} showCourse={false} />
        </section>
      ) : null}

      {assessments ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Assessments
          </h2>
          {assessments.results.length ? (
            <ul className="flex flex-col gap-2">
              {assessments.results.map((assessment) => (
                <li
                  key={assessment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-rule bg-surface px-3 py-2"
                >
                  <div>
                    <Link
                      href={`/grades/${assessment.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {assessment.title}
                    </Link>
                    <p className="tabular text-xs text-ink-faint">
                      out of {assessment.max_score} · weight{" "}
                      {assessment.weight} ·{" "}
                      {assessment.held_on
                        ? formatDate(assessment.held_on)
                        : "no date"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular text-xs text-ink-faint">
                      {formatNumber(assessment.marked_count)} marked
                    </span>
                    {assessment.is_published ? (
                      <Badge tone="ok">Published</Badge>
                    ) : (
                      <Badge tone="warn">Not published</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded border border-rule bg-surface px-4 py-8 text-center text-sm text-ink-soft">
              No assessments yet.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
