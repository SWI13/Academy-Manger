"use client";

import Link from "next/link";

import { PersonCell } from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import type { Column } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatMoney } from "@/lib/format";
import type { Dict } from "@/lib/dict/en";
import { fill } from "@/lib/i18n";
import type { Permission } from "@/lib/permissions";
import type { Payment } from "@/types";

/**
 * One column factory, not one table per role.
 *
 * A payments table is a payments table. What differs between a student and
 * the owner is which columns appear, and that is decided here from the
 * caller's permissions. Five parallel tables is how a fix to one of them
 * silently misses the other four.
 *
 * Omitting a column is presentation, not protection. The API already declines
 * to send another student's payments at all - see the scoped queryset - so
 * there is no row here that the caller was not entitled to receive.
 */
export function paymentColumns(
  can: (permission: Permission) => boolean,
  d: Dict,
): Column<Payment>[] {
  const seesEveryone = can("payment.create");

  const columns: Column<Payment>[] = [];

  // A student sees their own payments and nobody else's, so naming the payer
  // in every row would just be their own name repeated down the page. For
  // them the reference is the heading; for staff, the person is.
  if (seesEveryone) {
    columns.push({
      key: "student",
      header: d.filters.student,
      lead: true,
      cell: (payment) => (
        <PersonCell
          name={payment.student_name}
          publicId={payment.student_public_id}
        />
      ),
    });
  }

  columns.push({
    key: "public_id",
    header: d.payments.reference,
    lead: !seesEveryone,
    cell: (payment) => (
      <Link
        href={`/payments/${payment.public_id}`}
        className="tabular inline-flex items-center gap-1.5 font-medium text-ink hover:text-accent"
      >
        {payment.public_id}
        {payment.proofs.length ? (
          <Icon
            name="file"
            size={13}
            title={fill(d.phrases.proofsAttached, { count: payment.proofs.length })}
            className="text-ink-faint"
          />
        ) : null}
      </Link>
    ),
  });

  columns.push(
    {
      key: "course",
      header: d.filters.course,
      secondary: true,
      cell: (payment) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{payment.course_title}</p>
          <p className="tabular truncate text-xs text-ink-faint">
            {payment.course_public_id}
          </p>
        </div>
      ),
    },
    {
      key: "amount",
      header: d.payments.amount,
      numeric: true,
      cell: (payment) => (
        // Pending money is amber wherever it appears. A ledger that renders a
        // claim and a confirmed receipt identically is a ledger that gets read
        // as though the money is in.
        <span
          className={`font-semibold ${
            payment.status === "APPROVED"
              ? "text-ink"
              : payment.status === "PENDING"
                ? "text-warn"
                : "text-ink-faint line-through"
          }`}
        >
          {formatMoney(payment.amount_minor, payment.currency)}
        </span>
      ),
    },
    {
      key: "paid_on",
      header: d.payments.paidOn,
      secondary: true,
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
      key: "status",
      header: d.columns.status,
      trail: true,
      width: "1%",
      cell: (payment) => <StatusBadge status={payment.status} />,
    },
  );

  // Who signed it off. Only meaningful to whoever can sign one off, and it is
  // the column that makes separation of duty visible on screen: the recorder
  // and the approver are never the same person.
  if (can("payment.approve")) {
    columns.push({
      key: "handled",
      header: d.payments.recordedDecided,
      secondary: true,
      cell: (payment) => (
        <div className="tabular text-xs">
          <p className="text-ink-soft">{payment.created_by_public_id ?? "—"}</p>
          <p className="text-ink-faint">
            {payment.approved_by_public_id ??
              payment.rejected_by_public_id ??
              "—"}
          </p>
        </div>
      ),
    });
  }

  return columns;
}
