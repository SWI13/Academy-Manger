"use client";

import { useDict } from "@/components/LocaleProvider";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { label, type PrintColumn, type PrintFilter } from "@/lib/print";
import type { Enrollment, Organisation } from "@/types";

import { PrintDocument } from "../../PrintDocument";

/**
 * CLASS LIST - who is on a course.
 *
 * The agreed price is on the enrolment rather than the course, because that
 * is where this platform keeps it: what a student agreed to pay is frozen at
 * enrolment and does not move when the catalogue does.
 */
export function ClassListSheet({
  organisation,
  rows,
  count,
  filters,
  printedAt,
  truncated,
  showsPrice,
  oneClass,
}: {
  organisation: Organisation;
  rows: Enrollment[];
  count: number;
  filters: PrintFilter[];
  printedAt?: string;
  truncated?: boolean;
  showsPrice: boolean;
  /** Narrowed to a single course: the document is a class list, not a ledger. */
  oneClass: boolean;
}) {
  const d = useDict();

  const columns: PrintColumn<Enrollment>[] = [
    {
      key: "index",
      header: "#",
      width: "5%",
      numeric: true,
      cell: (_row, index) => <span className="sheet-muted">{index + 1}</span>,
    },
    {
      key: "student",
      header: d.filters.student,
      width: "28%",
      cell: (row) => (
        <>
          <span className="sheet-strong">{row.student.full_name}</span>
          <span className="sheet-sub">{row.student.public_id}</span>
        </>
      ),
    },
    {
      key: "contact",
      header: d.columns.contact,
      width: "18%",
      cell: (row) => <span className="sheet-muted">{row.student.phone ?? "—"}</span>,
    },
    {
      key: "course",
      header: d.attendance.classLabel,
      width: "22%",
      cell: (row) => (
        <>
          {row.course_title}
          <span className="sheet-sub">{row.course_public_id}</span>
        </>
      ),
    },
    {
      key: "enrolled",
      header: d.print.registered,
      width: "13%",
      numeric: true,
      cell: (row) => formatDate(row.enrolled_at),
    },
    {
      key: "status",
      header: d.print.status,
      width: "12%",
      cell: (row) => label(d.status, row.status),
    },
  ];

  if (showsPrice) {
    columns.splice(5, 0, {
      key: "agreed",
      header: d.payments.agreed,
      width: "14%",
      numeric: true,
      cell: (row) => formatMoney(row.price_at_enrollment_minor, row.currency ?? "DZD"),
    });
  }

  const totals = [{ label: d.print.totalStudents, value: formatNumber(count) }];
  if (showsPrice) {
    totals.push({
      label: d.payments.agreed,
      // The rows on this sheet, and only those. A total describing a different
      // selection is the one thing a filtered document must not do.
      value: formatMoney(
        rows.reduce((sum, row) => sum + row.price_at_enrollment_minor, 0),
        rows[0]?.currency ?? "DZD",
      ),
    });
  }

  return (
    <PrintDocument
      organisation={organisation}
      title={oneClass ? d.print.classList : d.print.enrollmentList}
      subtitle={oneClass ? rows[0]?.course_title : undefined}
      filters={filters}
      columns={columns}
      rows={rows}
      rowKey={(row) => String(row.id)}
      printedAt={printedAt}
      truncated={truncated}
      totals={totals}
      orientation={showsPrice ? "landscape" : "portrait"}
    />
  );
}
