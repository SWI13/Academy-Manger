"use client";

import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Note } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/format";
import type { Score } from "@/types";

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
const COLUMNS: Column<Score>[] = [
  {
    key: "assessment",
    header: "Assessment",
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
    header: "Type",
    secondary: true,
    cell: (score) => (
      <span className="capitalize text-ink-soft">
        {score.assessment_kind.toLowerCase()}
      </span>
    ),
  },
  {
    key: "score",
    header: "Mark",
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
    header: "Percent",
    numeric: true,
    trail: true,
    cell: (score) => percent(score.percentage),
  },
  {
    key: "entered",
    header: "Recorded",
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

export function MyMarks({ marks }: { marks: Score[] }) {
  const corrected = marks.filter((score) => score.was_edited).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your marks"
        lede="Published results only. A mark appears here once your professor releases the assessment it belongs to."
      />

      {/*
        No overall average. The backend computes a weighted average per
        enrolment; adding these rows up in the browser would produce a
        different number, and the wrong one.
      */}
      <DataTable
        caption="Your marks"
        columns={COLUMNS}
        rows={marks}
        rowKey={(score) => String(score.id)}
        emptyIcon="check-circle"
        empty="No marks published yet"
        emptyDescription="Your professor releases an assessment when the class has been marked. Nothing is hidden from you here — there is simply nothing yet."
      />

      {corrected ? (
        <Note tone="warn">
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone="warn" size="sm">
              Corrected
            </Badge>
            {corrected === 1 ? "One of these was" : `${corrected} of these were`}{" "}
            changed after first being recorded. Marks do not lock, so a
            professor can put right a mistake at any point.
          </span>
        </Note>
      ) : null}
    </div>
  );
}
