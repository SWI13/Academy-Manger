"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Card";
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
    lead: true,
    cell: (payment) => (
      <Link
        href={`/payments/${payment.public_id}`}
        className="tabular font-medium text-ink hover:text-accent"
      >
        {payment.public_id}
      </Link>
    ),
  },
  {
    key: "paid_on",
    header: "Paid on",
    cell: (payment) => (
      <span className="tabular whitespace-nowrap text-ink-soft">
        {formatDate(payment.paid_on)}
      </span>
    ),
  },
  {
    key: "method",
    header: "Method",
    secondary: true,
    cell: (payment) => (
      <span className="capitalize text-ink-soft">
        {payment.method.replace(/_/g, " ").toLowerCase()}
      </span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    numeric: true,
    cell: (payment) => (
      <span className="font-medium text-ink">
        {formatMoney(payment.amount_minor, payment.currency)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    trail: true,
    width: "1%",
    cell: (payment) => <StatusBadge status={payment.status} />,
  },
];

export function EnrollmentPayments({
  payments,
  enrollmentId,
  mayRecord,
}: {
  payments: Payment[];
  enrollmentId: number | string;
  mayRecord: boolean;
}) {
  return (
    <section>
      <SectionHeader
        title="Payments"
        description="Every entry is recorded first and approved by somebody else."
        action={
          mayRecord ? (
            <LinkButton
              href={`/payments/new?enrollment=${enrollmentId}`}
              size="sm"
              icon="plus"
            >
              Record a payment
            </LinkButton>
          ) : null
        }
      />
      <DataTable
        caption="Payments for this enrolment"
        columns={COLUMNS}
        rows={payments}
        rowKey={(payment) => payment.public_id}
        rowHref={(payment) => `/payments/${payment.public_id}`}
        emptyIcon="wallet"
        empty="Nothing recorded against this enrolment yet"
        emptyDescription="Cash taken at the desk, a transfer or a cheque — each is recorded here and then approved."
      />
    </section>
  );
}
