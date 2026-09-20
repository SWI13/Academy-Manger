"use client";

import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import type { Dict } from "@/lib/dict/en";
import { Note } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/format";
import type { Score } from "@/types";
import { useDict } from "@/components/LocaleProvider";

import { percent } from "./GradebookTable";

/**
 * A student's own marks, across every course they have taken.
 *
 * Only published marks reach this list - the scoped queryset filters
 * unpublished ones out on the backend, so there is nothing here to hide. The
 * "corrected" note is deliberate: a professor may change a mark at any time
 * (architecture D-7), and a mark that quietly changed between two visits is
 * worse than one that says it changed.
 */
function columnsFor(d: Dict): Column<Score>[] {
  return [
  {
    key: "assessment",
    header: d.grades.assessment,
    lead: true,
    cell: (score) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{score.assessment_title}</p>
        <p className="truncate text-xs text-ink-faint">
          {score.course_title}{" "}
          <span className="tabular">{score.course_public_id}</span>
        </p>
      </div>
    ),
  },
  {
    key: "kind",
    header: d.columns.type,
    secondary: true,
    cell: (score) => (
      <span className="capitalize text-ink-soft">
        {score.assessment_kind.toLowerCase()}
      </span>
    ),
  },
  {
    key: "score",
    header: d.columns.mark,
    numeric: true,
    cell: (score) => (
      <span className="font-semibold text-ink">
        {Number(score.score)}
        <span className="font-normal text-ink-faint">
          {" "}
          / {Number(score.max_score)}
        </span>
      </span>
    ),
  },
  {
    key: "percentage",
    header: d.columns.percent,
    numeric: true,
    trail: true,
    cell: (score) => percent(score.percentage, d),
  },
  {
    key: "entered",
    header: d.grades.recorded,
    secondary: true,
    cell: (score) => (
      <div className="tabular text-xs">
        <p className="text-ink-soft">{formatDate(score.entered_at)}</p>
        {score.was_edited ? (
          <p className="text-warn">
            corrected {formatDate(score.last_changed_at)}
          </p>
        ) : null}
      </div>
    ),
  },
  ];
}

export function MyMarks({ marks }: { marks: Score[] }) {
  const d = useDict();
  const corrected = marks.filter((score) => score.was_edited).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={d.grades.yourMarks}
        lede={d.grades.yourMarksLede}
      />

      {/*
        No overall average. The backend computes a weighted average per
        enrolment; adding these rows up in the browser would produce a
        different number, and the wrong one.
      */}
      <DataTable
        caption={d.grades.yourMarks}
        columns={columnsFor(d)}
        rows={marks}
        rowKey={(score) => String(score.id)}
        emptyIcon="check-circle"
        empty={d.grades.noMarks}
        emptyDescription={d.grades.noMarksBody}
      />

      {corrected ? (
        <Note tone="warn">
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone="warn" size="sm">{d.grades.corrected}</Badge>
            {corrected === 1 ? "One of these was" : `${corrected} of these were`}{" "}
            changed after first being recorded. Marks do not lock, so a
            professor can put right a mistake at any point.
          </span>
        </Note>
      ) : null}
    </div>
  );
}
