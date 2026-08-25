import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/ui/Badge";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { getJson } from "@/lib/django";
import { formatDate, formatMoney } from "@/lib/format";
import { cookieHeader, getSession, can } from "@/lib/session";
import type { Enrollment, Payment } from "@/types";

import { BalanceCard, type Balance } from "./BalanceCard";
import { EnrollmentPayments } from "./EnrollmentPayments";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `Enrolment ${(await params).id} · SM Academy` };
}

export default async function EnrollmentPage({ params }: Props) {
  const { id } = await params;
  const cookie = await cookieHeader();

  const enrollment = await getJson<Enrollment>(
    `/api/v1/enrollments/${id}/`,
    cookie,
  );
  if (!enrollment) notFound();

  const session = await getSession();

  // The balance and the payment list are separate endpoints with their own
  // permission. A professor reaches this page for the roster fields and gets
  // neither - so both are fetched conditionally rather than fetched and then
  // hidden. An unauthorized request that returns null is still a request.
  const showsMoney = can(session, "payment.view");

  const [balance, payments] = showsMoney
    ? await Promise.all([
        getJson<Balance>(`/api/v1/enrollments/${id}/balance/`, cookie),
        getJson<{ results: Payment[] }>(
          `/api/v1/payments/?student=${enrollment.student.public_id}&course=${enrollment.course_public_id}`,
          cookie,
        ),
      ])
    : [null, null];

  const student = enrollment.student;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/enrollments"
            className="text-sm text-ink-soft hover:text-ink"
          >
            ← Enrolments
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">
            {student.full_name}
          </h1>
          <p className="tabular mt-1 text-sm text-ink-soft">
            {student.public_id} · {enrollment.course_title} (
            {enrollment.course_public_id})
          </p>
        </div>
        <StatusBadge status={enrollment.status} />
      </header>

      <section className="rounded border border-rule bg-surface p-4">
        <DescriptionList
          items={[
            { label: "Enrolled", value: formatDate(enrollment.enrolled_at) },
            student.age !== null && student.age !== undefined
              ? { label: "Age", value: student.age }
              : null,
            student.wilaya ? { label: "Wilaya", value: student.wilaya } : null,
            student.prior_level
              ? { label: "Prior level", value: student.prior_level }
              : null,
            student.phone ? { label: "Phone", value: student.phone } : null,
            showsMoney
              ? {
                  label: "Price agreed at enrolment",
                  value: formatMoney(
                    enrollment.price_at_enrollment_minor,
                    enrollment.currency,
                  ),
                }
              : null,
            enrollment.notes
              ? { label: "Notes", value: enrollment.notes }
              : null,
          ]}
        />
      </section>

      {balance ? <BalanceCard balance={balance} /> : null}

      {payments ? <EnrollmentPayments payments={payments.results} /> : null}
    </div>
  );
}
