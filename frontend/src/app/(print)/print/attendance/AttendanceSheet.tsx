"use client";

import { useDict } from "@/components/LocaleProvider";
import { formatNumber } from "@/lib/format";
import type { PrintColumn, PrintFilter } from "@/lib/print";
import type { AttendanceStudentRow, AttendanceSummary, Organisation } from "@/types";

import { PrintDocument } from "../../PrintDocument";

/**
 * ATTENDANCE REPORT - rates over a period, one row per student.
 *
 * Every percentage is the backend's - `services.attendance_rate`, where late
 * counting as attended is decided once. A rate worked out here would be the
 * second definition of it in the platform, and the two would part company the
 * first time somebody changed their mind.
 */
export function AttendanceSheet({
  organisation,
  summary,
  filters,
}: {
  organisation: Organisation;
  summary: AttendanceSummary;
  filters: PrintFilter[];
}) {
  const d = useDict();

  const percent = (rate: number | null | undefined) =>
    rate === null || rate === undefined ? null : `${rate}%`;

  const columns: PrintColumn<AttendanceStudentRow>[] = [
    {
      key: "index",
      header: "#",
      width: "5%",
      numeric: true,
      cell: (_row, index) => <span className="sheet-muted">{index + 1}</span>,
    },
    {
      key: "student",
      header: d.columns.name,
      width: "30%",
      cell: (row) => (
        <>
          <span className="sheet-strong">{row.student_name}</span>
          <span className="sheet-sub">{row.student_public_id}</span>
        </>
      ),
    },
    {
      key: "course",
      header: d.attendance.classLabel,
      width: "23%",
      cell: (row) => (
        <>
          {row.course_title}
          <span className="sheet-sub">{row.course_public_id}</span>
        </>
      ),
    },
    {
      key: "present",
      header: d.attendance.present,
      width: "10%",
      numeric: true,
      cell: (row) => formatNumber(row.present),
    },
    {
      key: "late",
      header: d.attendance.late,
      width: "10%",
      numeric: true,
      cell: (row) => formatNumber(row.late),
    },
    {
      key: "absent",
      header: d.attendance.absent,
      width: "10%",
      numeric: true,
      cell: (row) => formatNumber(row.absent),
    },
    {
      key: "rate",
      header: d.print.attendanceRate,
      width: "12%",
      numeric: true,
      cell: (row) => <span className="sheet-strong">{percent(row.rate) ?? "—"}</span>,
    },
  ];

  return (
    <PrintDocument
      organisation={organisation}
      title={d.print.attendanceReport}
      subtitle={summary.course_title || undefined}
      filters={filters}
      columns={columns}
      rows={summary.students}
      rowKey={(row) => String(row.enrollment_id)}
      totals={[
        { label: d.print.totalStudents, value: formatNumber(summary.students.length) },
        { label: d.attendance.marked, value: formatNumber(summary.totals.total) },
        {
          label: d.print.attendanceRate,
          value: percent(summary.totals.rate) ?? d.attendance.noRate,
        },
      ]}
    >
      <p className="sheet-note">{d.attendance.summaryLede}</p>
    </PrintDocument>
  );
}
