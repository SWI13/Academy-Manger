"use client";

import { useDict } from "@/components/LocaleProvider";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { label, type PrintColumn, type PrintFilter } from "@/lib/print";
import type { Course, Organisation } from "@/types";

import { PrintDocument } from "../../PrintDocument";

/**
 * COURSE LIST.
 *
 * The price column appears only for a caller the API sends prices to. This
 * does not hide a column - it has nothing to put in one, because
 * `CourseSerializer` drops `price_minor` for anybody without `payment.view`.
 * That is the difference that matters: there is no figure in the payload to
 * find in a network tab.
 */
export function CoursesSheet({
  organisation,
  rows,
  count,
  filters,
  printedAt,
  truncated,
  showsPrice,
}: {
  organisation: Organisation;
  rows: Course[];
  count: number;
  filters: PrintFilter[];
  printedAt?: string;
  truncated?: boolean;
  showsPrice: boolean;
}) {
  const d = useDict();

  const columns: PrintColumn<Course>[] = [
    {
      key: "index",
      header: "#",
      width: "5%",
      numeric: true,
      cell: (_row, index) => <span className="sheet-muted">{index + 1}</span>,
    },
    {
      key: "course",
      header: d.filters.course,
      width: showsPrice ? "30%" : "40%",
      cell: (row) => (
        <>
          <span className="sheet-strong">{row.title}</span>
          <span className="sheet-sub">{row.public_id}</span>
        </>
      ),
    },
    {
      key: "runs",
      header: d.columns.runs,
      width: "20%",
      cell: (row) => `${formatDate(row.start_date)} — ${formatDate(row.end_date)}`,
    },
    {
      key: "seats",
      header: d.print.totalStudents,
      width: "13%",
      numeric: true,
      cell: (row) =>
        row.capacity
          ? `${formatNumber(row.seats_taken)} / ${formatNumber(row.capacity)}`
          : formatNumber(row.seats_taken),
    },
    {
      key: "status",
      header: d.print.status,
      width: "12%",
      cell: (row) => label(d.status, row.status),
    },
  ];

  if (showsPrice) {
    columns.splice(3, 0, {
      key: "price",
      header: d.payments.amount,
      width: "16%",
      numeric: true,
      cell: (row) =>
        row.price_minor === undefined
          ? "—"
          : formatMoney(row.price_minor, row.currency ?? "DZD"),
    });
  }

  return (
    <PrintDocument
      organisation={organisation}
      title={d.print.courseList}
      filters={filters}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.public_id}
      printedAt={printedAt}
      truncated={truncated}
      totals={[{ label: d.print.totalCourses, value: formatNumber(count) }]}
    />
  );
}
