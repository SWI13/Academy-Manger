import Link from "next/link";
import { notFound } from "next/navigation";

import { DescriptionList } from "@/components/ui/DescriptionList";
import { getJson } from "@/lib/django";
import { formatDate } from "@/lib/format";
import { cookieHeader } from "@/lib/session";
import type { Assessment, Enrollment, Score } from "@/types";

import { MarkSheet } from "./MarkSheet";
import { PublishPanel } from "./PublishPanel";

type Props = { params: Promise<{ assessmentId: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `Mark sheet ${(await params).assessmentId} · SM Academy` };
}

export default async function AssessmentPage({ params }: Props) {
  const { assessmentId } = await params;
  const cookie = await cookieHeader();

  const assessment = await getJson<Assessment>(
    `/api/v1/assessments/${assessmentId}/`,
    cookie,
  );
  // 404 whether it does not exist or belongs to another professor's course.
  if (!assessment) notFound();

  const [roster, scores] = await Promise.all([
    // The class list, not the marks: a sheet has to show every student,
    // including the ones with nothing entered yet.
    getJson<{ results: Enrollment[] }>(
      `/api/v1/enrollments/?course=${assessment.course_public_id}&status=ACTIVE&page_size=100`,
      cookie,
    ),
    getJson<Score[]>(`/api/v1/assessments/${assessmentId}/scores/`, cookie),
  ]);

  const rows = roster?.results ?? [];
  const marked = new Set((scores ?? []).map((score) => score.student_public_id));
  const unmarked = rows.filter((row) => !marked.has(row.student.public_id)).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          href={`/grades?course=${assessment.course_public_id}`}
          className="text-sm text-ink-soft hover:text-ink"
        >
          ← {assessment.course_title}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">
          {assessment.title}
        </h1>
      </header>

      <section className="rounded border border-rule bg-surface p-4">
        <DescriptionList
          items={[
            { label: "Type", value: (assessment.kind ?? "").toLowerCase() || "—" },
            { label: "Out of", value: String(assessment.max_score) },
            {
              label: "Weight",
              value: (
                <>
                  {assessment.weight}
                  <span className="text-ink-faint">
                    {" "}
                    — its share of the course average
                  </span>
                </>
              ),
            },
            assessment.held_on
              ? { label: "Held on", value: formatDate(assessment.held_on) }
              : null,
          ]}
        />
      </section>

      <PublishPanel assessment={assessment} unmarked={unmarked} />

      <MarkSheet
        assessment={assessment}
        roster={rows}
        scores={scores ?? []}
      />
    </div>
  );
}
