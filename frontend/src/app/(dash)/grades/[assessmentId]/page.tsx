import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Figure } from "@/components/ui/StatTile";
import { getJson } from "@/lib/django";
import { formatDate } from "@/lib/format";
import { cookieHeader } from "@/lib/session";
import type { Assessment, Enrollment, Score } from "@/types";
import { getDict } from "@/lib/i18n.server";

import { MarkSheet } from "./MarkSheet";
import { PublishPanel } from "./PublishPanel";

type Props = { params: Promise<{ assessmentId: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `Mark sheet ${(await params).assessmentId}` };
}

export default async function AssessmentPage({ params }: Props) {
  const d = await getDict();
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
  const unmarked = rows.filter(
    (row) => !marked.has(row.student.public_id),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{
          href: `/grades?course=${assessment.course_public_id}`,
          label: assessment.course_title,
        }}
        title={assessment.title}
        badge={
          assessment.is_published ? (
            <Badge tone="ok" dot>{d.courses.published}</Badge>
          ) : (
            <Badge tone="warn" dot>{d.courses.notPublished}</Badge>
          )
        }
        eyebrow={
          <span className="capitalize">
            {(assessment.kind ?? "").toLowerCase() || "Assessment"}
            {assessment.held_on ? ` · ${formatDate(assessment.held_on)}` : ""}
          </span>
        }
      />

      <Card>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Figure label={d.grades.outOf} value={String(assessment.max_score)} />
          <Figure
            label={d.grades.weight}
            value={String(assessment.weight)}
            note={d.grades.weightNote}
          />
          <Figure
            label={d.grades.marked}
            value={`${rows.length - unmarked} / ${rows.length}`}
            tone={unmarked ? "warn" : "ok"}
          />
          <Figure
            label={d.grades.heldOn}
            value={assessment.held_on ? formatDate(assessment.held_on) : "—"}
          />
        </dl>
      </Card>

      <PublishPanel assessment={assessment} unmarked={unmarked} />

      <MarkSheet
        assessment={assessment}
        roster={rows}
        scores={scores ?? []}
      />
    </div>
  );
}
