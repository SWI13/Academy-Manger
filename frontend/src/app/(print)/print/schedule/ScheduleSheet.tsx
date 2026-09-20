"use client";

import { useDict } from "@/components/LocaleProvider";
import { formatNumber, weekdayName } from "@/lib/format";
import { label, type PrintColumn, type PrintFilter } from "@/lib/print";
import type { Organisation, Schedule } from "@/types";

import { PrintDocument } from "../../PrintDocument";

/** CLASS SCHEDULE - the weekly pattern, read down the week. */
export function ScheduleSheet({
  organisation,
  rows,
  count,
  filters,
  intl,
  printedAt,
  truncated,
}: {
  organisation: Organisation;
  rows: Schedule[];
  count: number;
  filters: PrintFilter[];
  intl: string;
  printedAt?: string;
  truncated?: boolean;
}) {
  const d = useDict();

  const columns: PrintColumn<Schedule>[] = [
    {
      key: "day",
      header: d.filters.day,
      width: "16%",
      cell: (row) => <span className="sheet-strong">{weekdayName(row.weekday, intl)}</span>,
    },
    {
      key: "time",
      header: d.print.time,
      width: "16%",
      numeric: true,
      cell: (row) => `${short(row.start_time)} — ${short(row.end_time)}`,
    },
    {
      key: "course",
      header: d.attendance.classLabel,
      width: "34%",
      cell: (row) => (
        <>
          <span className="sheet-strong">{row.course_title}</span>
          <span className="sheet-sub">{row.course_public_id}</span>
        </>
      ),
    },
    {
      key: "room",
      header: d.attendance.room,
      width: "14%",
      cell: (row) => row.room || "—",
    },
    {
      key: "professor",
      header: d.roles.PROFESSOR,
      width: "12%",
      cell: (row) => <span className="sheet-muted">{row.professor_public_id ?? "—"}</span>,
    },
    {
      key: "status",
      header: d.print.status,
      width: "10%",
      cell: (row) => label(d.status, row.status),
    },
  ];

  return (
    <PrintDocument
      organisation={organisation}
      title={d.print.scheduleTitle}
      subtitle={rows.length === 1 ? rows[0].course_title : undefined}
      filters={filters}
      columns={columns}
      rows={rows}
      rowKey={(row) => String(row.id)}
      printedAt={printedAt}
      truncated={truncated}
      totals={[{ label: d.print.totalRecords, value: formatNumber(count) }]}
    />
  );
}

/** "17:00:00" is a database value; "17:00" is a timetable. */
function short(time: string): string {
  return time.slice(0, 5);
}
