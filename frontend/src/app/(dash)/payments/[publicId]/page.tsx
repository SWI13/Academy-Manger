import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Timeline, type TimelineEntry } from "@/components/ui/Timeline";
import { getJson } from "@/lib/django";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { cookieHeader } from "@/lib/session";
import type { Payment } from "@/types";

import { ApprovalPanel } from "./ApprovalPanel";
import { ProofList } from "./ProofList";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `${(await params).publicId}` };
}

export default async function PaymentPage({ params }: Props) {
  const { publicId } = await params;
  const payment = await getJson<Payment>(
    `/api/v1/payments/${publicId}/`,
    await cookieHeader(),
  );

  // 404 whether it does not exist or is outside this caller's scope. The API
  // makes no distinction and neither does this page - a "forbidden" here
  // would confirm the reference is real, and payment references are
  // sequential.
  if (!payment) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/payments", label: "Payments" }}
        title={<span className="tabular">{payment.public_id}</span>}
        badge={<StatusBadge status={payment.status} />}
        eyebrow={
          <>
            {payment.student_name}{" "}
            <span className="tabular text-ink-faint">
              {payment.student_public_id}
            </span>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-5">
          {/* --- the amount, at the size the amount deserves ----------- */}
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Amount</p>
                <p
                  className={`tabular mt-2 text-4xl font-semibold tracking-tight ${
                    payment.status === "APPROVED"
                      ? "text-ok"
                      : payment.status === "PENDING"
                        ? "text-warn"
                        : "text-ink-faint"
                  }`}
                >
                  {formatMoney(payment.amount_minor, payment.currency)}
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  {payment.status === "PENDING"
                    ? "Recorded, not yet approved. This is not counted as paid."
                    : payment.status === "APPROVED"
                      ? "Approved and counted against the balance."
                      : payment.status === "REJECTED"
                        ? "Rejected. Nothing was counted."
                        : "Cancelled before any decision was made."}
                </p>
              </div>

              <Link
                href={`/courses/${payment.course_public_id}`}
                className="group min-w-0 rounded-lg border border-rule bg-black/30 px-3.5 py-2.5 transition-colors hover:border-rule-strong"
              >
                <span className="eyebrow block">Course</span>
                <span className="mt-1 block truncate text-sm font-medium text-ink group-hover:text-accent">
                  {payment.course_title}
                </span>
                <span className="tabular block text-xs text-ink-faint">
                  {payment.course_public_id}
                </span>
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" icon="receipt" divider className="mb-5" />
            <DescriptionList
              items={[
                {
                  label: "Student",
                  value: (
                    <>
                      {payment.student_name}{" "}
                      <span className="tabular text-ink-faint">
                        {payment.student_public_id}
                      </span>
                    </>
                  ),
                },
                {
                  label: "Paid on",
                  value: (
                    <span className="tabular">{formatDate(payment.paid_on)}</span>
                  ),
                },
                {
                  label: "Method",
                  value: (
                    <span className="capitalize">
                      {payment.method.replace(/_/g, " ").toLowerCase()}
                    </span>
                  ),
                },
                {
                  label: "Currency",
                  value: <span className="tabular">{payment.currency}</span>,
                },
                payment.rejection_reason
                  ? {
                      label: "Reason for rejection",
                      value: payment.rejection_reason,
                      wide: true,
                    }
                  : null,
                payment.notes
                  ? { label: "Notes", value: payment.notes, wide: true }
                  : null,
              ]}
            />
          </Card>

          <ApprovalPanel payment={payment} />
        </div>

        {/* --- the side column: what happened, and the evidence -------- */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="History" icon="clock" divider className="mb-5" />
            <Timeline entries={historyOf(payment)} />
            <p className="mt-5 border-t border-rule pt-4 text-xs leading-relaxed text-ink-faint">
              All three outcomes are final. There is no un-approve: a correction
              after the fact is a new record, so the ledger keeps both.
            </p>
          </Card>

          <Card>
            <CardHeader
              title="Proof"
              icon="file"
              description={
                payment.proofs.length
                  ? undefined
                  : "Cash taken at the desk normally has none."
              }
              divider
              className="mb-4"
            />
            <ProofList proofs={payment.proofs} publicId={payment.public_id} />
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * The life of one payment, from its own fields.
 *
 * Every entry is a timestamp the API sent. The pending step at the end is
 * drawn as a future one when nothing has happened yet - which is the honest
 * way to show a record that is waiting for a person rather than one that is
 * finished.
 */
function historyOf(payment: Payment): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: "recorded",
      icon: "plus",
      tone: "info",
      title: "Recorded",
      meta: formatDateTime(payment.created_at),
      body: payment.created_by_public_id ? (
        <span className="tabular">by {payment.created_by_public_id}</span>
      ) : null,
    },
  ];

  if (payment.approved_at) {
    entries.push({
      id: "approved",
      icon: "check",
      tone: "ok",
      title: "Approved",
      meta: formatDateTime(payment.approved_at),
      body: payment.approved_by_public_id ? (
        <span className="tabular">by {payment.approved_by_public_id}</span>
      ) : null,
    });
  } else if (payment.rejected_at) {
    entries.push({
      id: "rejected",
      icon: "close",
      tone: "bad",
      title: payment.status === "CANCELLED" ? "Cancelled" : "Rejected",
      meta: formatDateTime(payment.rejected_at),
      body: (
        <>
          {payment.rejected_by_public_id ? (
            <span className="tabular">by {payment.rejected_by_public_id}</span>
          ) : null}
          {payment.rejection_reason ? (
            <p className="mt-1 text-ink-soft">{payment.rejection_reason}</p>
          ) : null}
        </>
      ),
    });
  } else {
    entries.push({
      id: "awaiting",
      icon: "clock",
      tone: "warn",
      title: "Awaiting approval",
      body: (
        <span className="inline-flex items-center gap-1.5">
          <Icon name="lock" size={13} />
          Not the person who recorded it
        </span>
      ),
      future: true,
    });
  }

  return entries;
}
