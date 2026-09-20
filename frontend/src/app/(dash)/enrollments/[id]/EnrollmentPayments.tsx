"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import type { Dict } from "@/lib/dict/en";
import { formatDate, formatMoney } from "@/lib/format";
import type { Payment } from "@/types";
import { useDict } from "@/components/LocaleProvider";

/**
 * The payment history for one enrolment.
 *
 * A narrower column set than the ledger: the student and course are already
 * the heading of the page, so repeating them down every row would be noise.
 * Same table component, different columns - which is the whole argument for
 * the column factory.
 */
function columnsFor(d: Dict): Column<Payment>[] {
  return [
  {
    key: "public_id",
    header: d.payments.reference,
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
    header: d.payments.paidOn,
    cell: (payment) => (
      <span className="tabular whitespace-nowrap text-ink-soft">
        {formatDate(payment.paid_on)}
      </span>
    ),
  },
  {
    key: "method",
    header: d.payments.method,
    secondary: true,
    cell: (payment) => (
      <span className="capitalize text-ink-soft">
        {payment.method.replace(/_/g, " ").toLowerCase()}
      </span>
    ),
  },
  {
    key: "amount",
    header: d.payments.amount,
    numeric: true,
    cell: (payment) => (
      <span className="font-medium text-ink">
        {formatMoney(payment.amount_minor, payment.currency)}
      </span>
    ),
  },
  {
    key: "status",
    header: d.columns.status,
    trail: true,
    width: "1%",
    cell: (payment) => <StatusBadge status={payment.status} />,
  },
  ];
}

export function EnrollmentPayments({
  payments,
  enrollmentId,
  mayRecord,
}: {
  payments: Payment[];
  enrollmentId: number | string;
  mayRecord: boolean;
}) {
  const d = useDict();
  return (
    <section>
      <SectionHeader
        title={d.nav.payments}
        description={d.enrollments.paymentsNote}
        action={
          mayRecord ? (
            <LinkButton
              href={`/payments/new?enrollment=${enrollmentId}`}
              size="sm"
              icon="plus"
            >{d.payments.recordTitle}</LinkButton>
          ) : null
        }
      />
      <DataTable
        caption={d.enrollments.paymentsFor}
        columns={columnsFor(d)}
        rows={payments}
        rowKey={(payment) => payment.public_id}
        rowHref={(payment) => `/payments/${payment.public_id}`}
        emptyIcon="wallet"
        empty={d.enrollments.noPayments}
        emptyDescription={d.enrollments.noPaymentsBody}
      />
    </section>
  );
}
