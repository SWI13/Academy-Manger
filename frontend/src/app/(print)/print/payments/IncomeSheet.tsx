"use client";

import { useDict } from "@/components/LocaleProvider";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { label, type PrintColumn, type PrintFilter } from "@/lib/print";
import type { Organisation, Payment } from "@/types";

import { PrintDocument } from "../../PrintDocument";

/**
 * INCOME REPORT.
 *
 * The total is the sum of the approved rows *on this sheet*, and only those.
 * That is the one place this document does arithmetic, deliberately: a
 * filtered income report whose total described a different selection would be
 * worse than one with no total at all.
 *
 * Pending money is listed and excluded from the total, because a pending
 * payment is a claim rather than a receipt - the same rule the dashboard
 * follows. The sheet says which figure is which rather than folding one into
 * the other.
 */
export function IncomeSheet({
  organisation,
  rows,
  filters,
  subtitle,
  printedAt,
  truncated,
}: {
  organisation: Organisation;
  rows: Payment[];
  filters: PrintFilter[];
  subtitle: string;
  printedAt?: string;
  truncated?: boolean;
}) {
  const d = useDict();

  const currency = rows[0]?.currency ?? "DZD";
  const approved = rows.filter((row) => row.status === "APPROVED");
  const pending = rows.filter((row) => row.status === "PENDING");
  const total = approved.reduce((sum, row) => sum + row.amount_minor, 0);
  const pendingTotal = pending.reduce((sum, row) => sum + row.amount_minor, 0);

  const columns: PrintColumn<Payment>[] = [
    {
      key: "index",
      header: "#",
      width: "4%",
      numeric: true,
      cell: (_row, index) => <span className="sheet-muted">{index + 1}</span>,
    },
    {
      key: "paid_on",
      header: d.print.date,
      width: "10%",
      numeric: true,
      cell: (row) => formatDate(row.paid_on),
    },
    {
      key: "student",
      header: d.filters.student,
      width: "20%",
      cell: (row) => (
        <>
          <span className="sheet-strong">{row.student_name}</span>
          <span className="sheet-sub">{row.student_public_id}</span>
        </>
      ),
    },
    {
      key: "course",
      header: d.filters.course,
      width: "20%",
      cell: (row) => (
        <>
          {row.course_title}
          <span className="sheet-sub">{row.course_public_id}</span>
        </>
      ),
    },
    {
      key: "method",
      header: d.payments.method,
      width: "12%",
      cell: (row) => label(d.payments, row.method, row.method ?? "—"),
    },
    {
      key: "reference",
      header: d.print.receiptNumber,
      width: "12%",
      cell: (row) => <span className="sheet-muted">{row.public_id}</span>,
    },
    {
      key: "status",
      header: d.print.status,
      width: "10%",
      cell: (row) => label(d.status, row.status),
    },
    {
      key: "amount",
      header: d.payments.amount,
      width: "12%",
      numeric: true,
      cell: (row) => (
        <span className={row.status === "APPROVED" ? "sheet-strong" : "sheet-muted"}>
          {formatMoney(row.amount_minor, row.currency ?? currency)}
        </span>
      ),
    },
  ];

  const totals = [{ label: d.print.totalIncome, value: formatMoney(total, currency) }];
  if (pending.length) {
    totals.unshift({
      label: d.print.pendingPayments,
      value: formatMoney(pendingTotal, currency),
    });
  }

  return (
    <PrintDocument
      organisation={organisation}
      title={d.print.incomeReport}
      subtitle={subtitle}
      filters={filters}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.public_id}
      printedAt={printedAt}
      truncated={truncated}
      totals={totals}
      orientation="landscape"
    >
      {pending.length ? (
        <p className="sheet-note">
          {formatNumber(pending.length)} · {d.print.pendingNotice}
        </p>
      ) : null}
    </PrintDocument>
  );
}
