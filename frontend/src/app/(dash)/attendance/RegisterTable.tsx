"use client";

import Link from "next/link";

import { useDict } from "@/components/LocaleProvider";
import { StatusBadge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatDate, formatNumber } from "@/lib/format";
import type { AttendanceSession } from "@/types";

/**
 * The registers, as rows.
 *
 * The "marked" column carries the roster size beside it, because the useful
 * question about an open register is not how many are marked but how many are
 * left - and 12 / 40 answers it where 12 does not.
 */
export function RegisterTable({ rows }: { rows: AttendanceSession[] }) {
  const d = useDict();

  const columns: Column<AttendanceSession>[] = [
    {
      key: "held_on",
      header: d.attendance.heldOn,
      lead: true,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/attendance/${row.id}`}
            className="tabular font-medium text-ink hover:text-accent"
          >
            {formatDate(row.held_on)}
          </Link>
          {row.topic ? (
            <p className="truncate text-xs text-ink-faint">{row.topic}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "course",
      header: d.attendance.classLabel,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{row.course_title}</p>
          <p className="tabular truncate text-xs text-ink-faint">
            {row.course_public_id}
            {row.room ? ` · ${row.room}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "marked",
      header: d.attendance.marked,
      numeric: true,
      cell: (row) => (
        <span className={row.marked_count ? "text-ink" : "text-ink-faint"}>
          {formatNumber(row.marked_count)}
          <span className="text-ink-faint"> / {formatNumber(row.roster_count)}</span>
        </span>
      ),
    },
    {
      key: "present",
      header: d.attendance.present,
      numeric: true,
      secondary: true,
      cell: (row) => <span className="text-ok">{formatNumber(row.present_count)}</span>,
    },
    {
      key: "late",
      header: d.attendance.late,
      numeric: true,
      secondary: true,
      cell: (row) => (
        <span className={row.late_count ? "text-warn" : "text-ink-faint"}>
          {formatNumber(row.late_count)}
        </span>
      ),
    },
    {
      key: "absent",
      header: d.attendance.absent,
      numeric: true,
      secondary: true,
      cell: (row) => (
        <span className={row.absent_count ? "text-bad" : "text-ink-faint"}>
          {formatNumber(row.absent_count)}
        </span>
      ),
    },
    {
      key: "status",
      header: d.print.status,
      trail: true,
      width: "1%",
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <DataTable
      caption={d.attendance.title}
      columns={columns}
      rows={rows}
      rowKey={(row) => String(row.id)}
      rowHref={(row) => `/attendance/${row.id}`}
      emptyIcon="check-circle"
      empty={d.attendance.emptyTitle}
      emptyDescription={d.attendance.emptyBody}
    />
  );
}
