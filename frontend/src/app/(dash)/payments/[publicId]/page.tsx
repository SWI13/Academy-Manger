import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/ui/Badge";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { getJson } from "@/lib/django";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { cookieHeader } from "@/lib/session";
import type { Payment } from "@/types";

import { ApprovalPanel } from "./ApprovalPanel";
import { ProofList } from "./ProofList";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `${(await params).publicId} · SM Academy` };
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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/payments"
            className="text-sm text-ink-soft hover:text-ink"
          >
            ← Payments
          </Link>
          <h1 className="tabular mt-1 text-xl font-semibold tracking-tight text-ink">
            {payment.public_id}
          </h1>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatMoney(payment.amount_minor, payment.currency)}
          </p>
        </div>
        <StatusBadge status={payment.status} />
      </header>

      <section className="rounded border border-rule bg-surface p-4">
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
              label: "Course",
              value: (
                <>
                  {payment.course_title}{" "}
                  <span className="tabular text-ink-faint">
                    {payment.course_public_id}
                  </span>
                </>
              ),
            },
            { label: "Paid on", value: formatDate(payment.paid_on) },
            {
              label: "Method",
              value: payment.method.replace(/_/g, " ").toLowerCase(),
            },
            {
              label: "Recorded",
              value: (
                <>
                  {formatDateTime(payment.created_at)}
                  {payment.created_by_public_id ? (
                    <span className="tabular text-ink-faint">
                      {" "}
                      by {payment.created_by_public_id}
                    </span>
                  ) : null}
                </>
              ),
            },
            payment.approved_at
              ? {
                  label: "Approved",
                  value: (
                    <>
                      {formatDateTime(payment.approved_at)}
                      {payment.approved_by_public_id ? (
                        <span className="tabular text-ink-faint">
                          {" "}
                          by {payment.approved_by_public_id}
                        </span>
                      ) : null}
                    </>
                  ),
                }
              : null,
            payment.rejected_at
              ? {
                  label: "Rejected",
                  value: (
                    <>
                      {formatDateTime(payment.rejected_at)}
                      {payment.rejected_by_public_id ? (
                        <span className="tabular text-ink-faint">
                          {" "}
                          by {payment.rejected_by_public_id}
                        </span>
                      ) : null}
                    </>
                  ),
                }
              : null,
            payment.rejection_reason
              ? { label: "Reason", value: payment.rejection_reason }
              : null,
            payment.notes ? { label: "Notes", value: payment.notes } : null,
          ]}
        />
      </section>

      <ApprovalPanel payment={payment} />

      <section className="rounded border border-rule bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Proof
        </h2>
        <ProofList proofs={payment.proofs} />
      </section>
    </div>
  );
}
