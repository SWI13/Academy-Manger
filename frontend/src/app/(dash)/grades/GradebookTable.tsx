import Link from "next/link";

import { DataTable, type Column } from "@/components/ui/DataTable";
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
  if (value === null) return <span className="text-ink-faint">—</span>;
  const number = Number(value);
  const tone =
    number >= 50 ? "text-ok" : number >= 40 ? "text-warn" : "text-bad";
  return <span className={`font-medium ${tone}`}>{number.toFixed(2)}%</span>;
}

const COLUMNS: Column<GradebookRow>[] = [
  {
    key: "student",
    header: "Student",
    cell: (row) => (
      <Link
        href={`/enrollments/${row.enrollment_id}`}
        className="text-accent hover:underline"
      >
        <span className="block font-medium">{row.student_name}</span>
        <span className="tabular block text-xs text-ink-faint">
          {row.student_public_id}
        </span>
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
    cell: (row) => row.prior_level || "—",
  },
  {
    key: "marked",
    header: "Marked",
    numeric: true,
    cell: (row) => (
      <span
        className={
          row.marked_count < row.assessment_count ? "text-warn" : "text-ink-soft"
        }
      >
        {formatNumber(row.marked_count)} / {formatNumber(row.assessment_count)}
      </span>
    ),
  },
  {
    key: "average",
    header: "Average",
    numeric: true,
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
      empty="Nobody is enrolled in this course yet."
    />
  );
}
