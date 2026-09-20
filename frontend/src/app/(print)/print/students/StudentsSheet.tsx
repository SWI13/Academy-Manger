"use client";

import { useDict } from "@/components/LocaleProvider";
import { formatDate, formatNumber } from "@/lib/format";
import { label, type PrintColumn, type PrintFilter } from "@/lib/print";
import type { Organisation, User } from "@/types";

import { PrintDocument } from "../../PrintDocument";

/**
 * The columns of a student or staff list.
 *
 * A client component because `PrintDocument` is one - the cells are functions,
 * and a function cannot cross the server boundary. The same split the
 * dashboard's tables already use: the page fetches, this declares the shape.
 */
export function StudentsSheet({
  organisation,
  rows,
  count,
  filters,
  printedAt,
  truncated,
  staffSheet,
}: {
  organisation: Organisation;
  rows: User[];
  count: number;
  filters: PrintFilter[];
  printedAt?: string;
  truncated?: boolean;
  /** Decided by the `role` filter: the same document about different people. */
  staffSheet: boolean;
}) {
  const d = useDict();

  const columns: PrintColumn<User>[] = [
    {
      key: "index",
      header: "#",
      width: "5%",
      numeric: true,
      cell: (_row, index) => <span className="sheet-muted">{index + 1}</span>,
    },
    {
      key: "public_id",
      header: d.columns.name,
      width: "26%",
      cell: (row) => (
        <>
          <span className="sheet-strong">{row.full_name}</span>
          <span className="sheet-sub">{row.public_id}</span>
        </>
      ),
    },
    {
      key: "role",
      header: d.filters.role,
      width: "13%",
      cell: (row) => label(d.roles, row.primary_role),
    },
    {
      key: "contact",
      header: d.columns.contact,
      width: "20%",
      cell: (row) => (
        <>
          {row.phone ?? "—"}
          {row.email ? <span className="sheet-sub">{row.email}</span> : null}
        </>
      ),
    },
    {
      key: "status",
      header: d.print.status,
      width: "12%",
      cell: (row) => label(d.status, row.status),
    },
    {
      key: "created",
      header: d.print.registered,
      width: "14%",
      numeric: true,
      cell: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <PrintDocument
      organisation={organisation}
      title={staffSheet ? d.print.staffList : d.print.studentList}
      filters={filters}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.public_id}
      printedAt={printedAt}
      truncated={truncated}
      totals={[
        {
          label: staffSheet ? d.print.totalStaff : d.print.totalStudents,
          value: formatNumber(count),
        },
      ]}
    />
  );
}
