import Link from "next/link";

import { Toolbar } from "@/components/ui/Toolbar";
import { getJson } from "@/lib/django";
import type { SearchParams } from "@/lib/list";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Assessment, Gradebook, Score } from "@/types";

import { GradebookTable } from "./GradebookTable";
import { MyMarks } from "./MyMarks";

export const metadata = { title: "Grades · SM Academy" };

/**
 * One route, two audiences.
 *
 * A student asks "what did I get"; a professor asks "where is the class".
 * Those are different questions over the same rows, and the permission the
 * caller holds is what decides which one this page answers - not their role
 * name, and not two separate URLs to keep in step.
 */
export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const cookie = await cookieHeader();
  const session = await getSession();

  if (!can(session, "score.enter")) {
    const marks = await getJson<Score[]>(
      "/api/v1/assessments/my-marks/",
      cookie,
    );
    return <MyMarks marks={marks ?? []} />;
  }

  const course = (
    Array.isArray(params.course) ? params.course[0] : params.course
  )?.trim();

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
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Grades</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Averages are worked out from the raw marks every time they are asked
          for, never stored. Change an assessment&rsquo;s weight and every
          average moves with it.
        </p>
      </header>

      <Toolbar
        filters={[
          { param: "course", label: "Course", placeholder: "C-2026-001" },
        ]}
      />

      {!course ? (
        <p className="rounded border border-rule bg-surface px-4 py-10 text-center text-sm text-ink-soft">
          Enter a course ID to see its gradebook.
        </p>
      ) : !gradebook ? (
        <p className="rounded border border-rule bg-surface px-4 py-10 text-center text-sm text-ink-soft">
          No course {course} that you teach.
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
              {gradebook.course_title}
            </h2>
            <GradebookTable rows={gradebook.students} />
          </section>

          {assessments?.results.length ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
                Mark sheets
              </h2>
              <ul className="flex flex-wrap gap-2">
                {assessments.results.map((assessment) => (
                  <li key={assessment.id}>
                    <Link
                      href={`/grades/${assessment.id}`}
                      className="inline-flex items-center gap-2 rounded border border-rule-strong bg-surface px-3 py-1.5 text-sm text-ink hover:bg-sunk"
                    >
                      {assessment.title}
                      <span className="tabular text-xs text-ink-faint">
                        {assessment.marked_count} marked
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
