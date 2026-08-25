"use client";

import Link from "next/link";

import { PersonCell } from "@/components/ui/Avatar";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Meter } from "@/components/ui/Stars";
import { formatNumber } from "@/lib/format";
import type { GradebookRow } from "@/types";

/**
 * A percentage, or an honest blank.
 *
 * Null is not zero. A student nobody has marked yet has no average, and
 * printing 0% would put a failing figure beside a name for no reason other
 * than that the professor has not got to them.
 */
export function percent(value: string | null) {
  if (value === null) {
    return (
      <span className="text-ink-faint" title="Not marked yet">
        —
      </span>
    );
  }
  const number = Number(value);
  const tone =
    number >= 50 ? "text-ok" : number >= 40 ? "text-warn" : "text-bad";
  return <span className={`font-semibold ${tone}`}>{number.toFixed(2)}%</span>;
}

const COLUMNS: Column<GradebookRow>[] = [
  {
    key: "student",
    header: "Student",
    lead: true,
    cell: (row) => (
      <Link href={`/enrollments/${row.enrollment_id}`} className="block min-w-0">
        <PersonCell name={row.student_name} publicId={row.student_public_id} />
      </Link>
    ),
  },
  {
    key: "age",
    header: "Age",
    numeric: true,
    secondary: true,
    cell: (row) => row.age ?? "—",
  },
  {
    key: "level",
    header: "Level",
    secondary: true,
    cell: (row) => (
      <span className="text-ink-soft">{row.prior_level || "—"}</span>
    ),
  },
  {
    key: "marked",
    header: "Marked",
    numeric: true,
    cell: (row) => (
      <span className="inline-flex min-w-20 flex-col items-end gap-1.5">
        <span
          className={
            row.marked_count < row.assessment_count
              ? "text-warn"
              : "text-ink-soft"
          }
        >
          {formatNumber(row.marked_count)} / {formatNumber(row.assessment_count)}
        </span>
        {row.assessment_count > 0 ? (
          <Meter
            value={row.marked_count}
            max={row.assessment_count}
            tone={row.marked_count < row.assessment_count ? "warn" : "ok"}
            label={`${row.marked_count} of ${row.assessment_count} assessments marked`}
            className="w-16"
          />
        ) : null}
      </span>
    ),
  },
  {
    key: "average",
    header: "Average",
    numeric: true,
    trail: true,
    cell: (row) => percent(row.weighted_percentage),
  },
];

export function GradebookTable({ rows }: { rows: GradebookRow[] }) {
  return (
    <DataTable
      caption="Gradebook"
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.student_public_id}
      rowHref={(row) => `/enrollments/${row.enrollment_id}`}
      emptyIcon="users"
      empty="Nobody is enrolled in this course yet"
      emptyDescription="The gradebook fills in as students are enrolled and assessments are marked."
    />
  );
}
