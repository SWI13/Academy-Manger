"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/ui/Badge";
import type { Column } from "@/components/ui/DataTable";
import { formatDate, formatMoney } from "@/lib/format";
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
): Column<Payment>[] {
  const columns: Column<Payment>[] = [
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
  ];

  // A student sees their own payments and nobody else's, so naming the payer
  // in every row would just be their own name repeated down the page.
  if (can("payment.create")) {
    columns.push({
      key: "student",
      header: "Student",
      cell: (payment) => (
        <div>
          <p className="text-ink">{payment.student_name}</p>
          <p className="tabular text-xs text-ink-faint">
            {payment.student_public_id}
          </p>
        </div>
      ),
    });
  }

  columns.push(
    {
      key: "course",
      header: "Course",
      secondary: true,
      cell: (payment) => (
        <div>
          <p className="text-ink">{payment.course_title}</p>
          <p className="tabular text-xs text-ink-faint">
            {payment.course_public_id}
          </p>
        </div>
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
      key: "paid_on",
      header: "Paid on",
      secondary: true,
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
      key: "status",
      header: "Status",
      cell: (payment) => <StatusBadge status={payment.status} />,
    },
  );

  // Who signed it off. Only meaningful to whoever can sign one off, and it is
  // the column that makes separation of duty visible on screen: the recorder
  // and the approver are never the same person.
  if (can("payment.approve")) {
    columns.push({
      key: "handled",
      header: "Recorded / approved",
      secondary: true,
      cell: (payment) => (
        <div className="tabular text-xs text-ink-faint">
          <p>{payment.created_by_public_id ?? "—"}</p>
          <p>{payment.approved_by_public_id ?? payment.rejected_by_public_id ?? "—"}</p>
        </div>
      ),
    });
  }

  return columns;
}
