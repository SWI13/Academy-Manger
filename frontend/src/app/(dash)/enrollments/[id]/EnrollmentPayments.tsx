"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatDate, formatMoney } from "@/lib/format";
import type { Payment } from "@/types";

/**
 * The payment history for one enrolment.
 *
 * A narrower column set than the ledger: the student and course are already
 * the heading of the page, so repeating them down every row would be noise.
 * Same table component, different columns - which is the whole argument for
 * the column factory.
 */
const COLUMNS: Column<Payment>[] = [
  {
    key: "public_id",
    header: "Reference",
    cell: (payment) => (
      <Link
        href={`/payments/${payment.public_id}`}
        className="tabular font-medium text-accent hover:underline"
      >
        {payment.public_id}
      </Link>
    ),
  },
  {
    key: "paid_on",
    header: "Paid on",
    cell: (payment) => formatDate(payment.paid_on),
  },
  {
    key: "method",
    header: "Method",
    secondary: true,
    cell: (payment) => (
      <span className="text-ink-soft">
        {payment.method.replace(/_/g, " ").toLowerCase()}
      </span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    numeric: true,
    cell: (payment) => (
      <span className="font-medium">
        {formatMoney(payment.amount_minor, payment.currency)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    cell: (payment) => <StatusBadge status={payment.status} />,
  },
];

export function EnrollmentPayments({ payments }: { payments: Payment[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
        Payments
      </h2>
      <DataTable
        caption="Payments for this enrolment"
        columns={COLUMNS}
        rows={payments}
        rowKey={(payment) => payment.public_id}
        empty="Nothing recorded against this enrolment yet."
      />
    </section>
  );
}
