"use client";

import Link from "next/link";

import { PersonCell } from "@/components/ui/Avatar";
import { DataTable, type Column } from "@/components/ui/DataTable";
import type { Dict } from "@/lib/dict/en";
import { Meter } from "@/components/ui/Stars";
import { formatNumber } from "@/lib/format";
/** The placeholder filler, passed in because a column table is not a
    component and so cannot call a hook of its own. */
type Filler = (template: string, values: Record<string, string | number>) => string;

import type { GradebookRow } from "@/types";
import { useDict, useFill } from "@/components/LocaleProvider";

/**
 * A percentage, or an honest blank.
 *
 * Null is not zero. A student nobody has marked yet has no average, and
 * printing 0% would put a failing figure beside a name for no reason other
 * than that the professor has not got to them.
 */
export function percent(value: string | null, d: Dict) {
  if (value === null) {
    return (
      <span className="text-ink-faint" title={d.grades.notMarkedYet}>
        —
      </span>
    );
  }
  const number = Number(value);
  const tone =
    number >= 50 ? "text-ok" : number >= 40 ? "text-warn" : "text-bad";
  return <span className={`font-semibold ${tone}`}>{number.toFixed(2)}%</span>;
}

function columnsFor(d: Dict, t: Filler): Column<GradebookRow>[] {
  return [
  {
    key: "student",
    header: d.filters.student,
    lead: true,
    cell: (row) => (
      <Link href={`/enrollments/${row.enrollment_id}`} className="block min-w-0">
        <PersonCell name={row.student_name} publicId={row.student_public_id} />
      </Link>
    ),
  },
  {
    key: "age",
    header: d.columns.age,
    numeric: true,
    secondary: true,
    cell: (row) => row.age ?? "—",
  },
  {
    key: "level",
    header: d.columns.level,
    secondary: true,
    cell: (row) => (
      <span className="text-ink-soft">{row.prior_level || "—"}</span>
    ),
  },
  {
    key: "marked",
    header: d.grades.marked,
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
            label={t(d.phrases.assessmentsMarked, {
              marked: row.marked_count,
              total: row.assessment_count,
            })}
            className="w-16"
          />
        ) : null}
      </span>
    ),
  },
  {
    key: "average",
    header: d.columns.average,
    numeric: true,
    trail: true,
    cell: (row) => percent(row.weighted_percentage, d),
  },
  ];
}

export function GradebookTable({ rows }: { rows: GradebookRow[] }) {
  const d = useDict();
  const t = useFill();
  return (
    <DataTable
      caption={d.grades.gradebook}
      columns={columnsFor(d, t)}
      rows={rows}
      rowKey={(row) => row.student_public_id}
      rowHref={(row) => `/enrollments/${row.enrollment_id}`}
      emptyIcon="users"
      empty={d.grades.nobodyEnrolled}
      emptyDescription={d.grades.nobodyEnrolledBody}
    />
  );
}
