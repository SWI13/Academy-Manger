import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/Card";
import { EmptyState, NoAccess } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import type { SearchParams } from "@/lib/list";
import { formatNumber } from "@/lib/format";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Assessment, Course, Gradebook, Score } from "@/types";
import { getDict } from "@/lib/i18n.server";

import { GradebookTable } from "./GradebookTable";
import { MyMarks } from "./MyMarks";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.nav.grades };
}

/**
 * One route, two audiences.
 *
 * A student asks "what did I get"; a professor asks "where is the class".
 * Those are different questions over the same rows, and the permission the
 * caller holds is what decides which one this page answers - not their role
 * name, and not two separate URLs to keep in step.
 *
 * The course is chosen from the ones the caller actually teaches rather than
 * typed as an identifier. The list comes from the scoped courses endpoint, so
 * the picker cannot offer a course whose gradebook would come back empty.
 */
export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const cookie = await cookieHeader();
  const session = await getSession();

  // Reception holds neither score permission. Without this the page would
  // fall through to the student branch and render an empty mark list, which
  // says "you have no marks" to somebody who was never going to have any.
  if (!can(session, "score.view")) return <NoAccess what={d.nav.grades} />;

  if (!can(session, "score.enter")) {
    const marks = await getJson<Score[]>(
      "/api/v1/assessments/my-marks/",
      cookie,
    );
    return <MyMarks marks={marks ?? []} />;
  }

  const requested = (
    Array.isArray(params.course) ? params.course[0] : params.course
  )?.trim();

  const courses = await getJson<{ results: Course[] }>(
    "/api/v1/courses/?page_size=100",
    cookie,
  );
  const teaching = courses?.results ?? [];

  // One course and nothing chosen: open it rather than making somebody pick
  // from a list of one.
  const course =
    requested ?? (teaching.length === 1 ? teaching[0].public_id : undefined);

  const [gradebook, assessments] = course
    ? await Promise.all([
        getJson<Gradebook>(`/api/v1/gradebook/?course=${course}`, cookie),
        getJson<{ results: Assessment[] }>(
          `/api/v1/assessments/?course=${course}`,
          cookie,
        ),
      ])
    : [null, null];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={d.nav.grades}
        lede={d.grades.lede}
      />

      {/* --- which course ------------------------------------------- */}
      {teaching.length > 1 ? (
        <div className="scroll-slim -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {teaching.map((row) => {
            const active = row.public_id === course;
            return (
              <Link
                key={row.public_id}
                href={`/grades?course=${row.public_id}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-accent bg-accent-soft font-medium text-accent"
                    : "border-rule bg-surface text-ink-soft shadow-xs hover:border-rule-strong hover:text-ink"
                }`}
              >
                <Icon name="book" size={15} />
                {row.title}
                <span className="tabular text-xs text-ink-faint">
                  {row.public_id}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {!teaching.length ? (
        <EmptyState
          icon="book"
          title={d.grades.noCourses}
          description={d.grades.noCoursesBody}
        />
      ) : !course ? (
        <EmptyState
          icon="check-circle"
          title={d.enrollments.chooseCourse}
          description={d.grades.chooseCourseBody}
        />
      ) : !gradebook ? (
        <EmptyState
          icon="alert"
          title={`No course ${course} that you teach`}
          description={d.grades.scopeNote}
        />
      ) : (
        <>
          <section>
            <SectionHeader
              title={gradebook.course_title}
              description={`${formatNumber(gradebook.students.length)} ${
                gradebook.students.length === 1 ? "student" : "students"
              } · weighted averages over published and unpublished marks alike`}
            />
            <GradebookTable rows={gradebook.students} />
          </section>

          {assessments?.results.length ? (
            <section>
              <SectionHeader
                title={d.grades.markSheets}
                description={d.grades.markSheetsNote}
              />
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {assessments.results.map((assessment) => (
                  <li key={assessment.id}>
                    <Link
                      href={`/grades/${assessment.id}`}
                      className="group flex h-full items-start justify-between gap-3 rounded-xl border border-rule bg-surface p-4 shadow-xs transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-sm"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink transition-colors group-hover:text-accent">
                          {assessment.title}
                        </span>
                        <span className="tabular mt-1 block text-xs text-ink-faint">
                          {formatNumber(assessment.marked_count)} marked · out of{" "}
                          {assessment.max_score}
                        </span>
                        <span className="mt-2.5 block">
                          {assessment.is_published ? (
                            <Badge tone="ok" size="sm" dot>{d.courses.published}</Badge>
                          ) : (
                            <Badge tone="warn" size="sm" dot>{d.courses.notPublished}</Badge>
                          )}
                        </span>
                      </span>
                      <Icon
                        name="chevron-right"
                        size={16}
                        className="mt-0.5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <EmptyState
              icon="check-circle"
              title={d.grades.noAssessments}
              description={d.grades.noAssessmentsBody}
            />
          )}
        </>
      )}
    </div>
  );
}
