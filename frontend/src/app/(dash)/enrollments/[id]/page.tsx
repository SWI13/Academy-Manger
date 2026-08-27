import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { PageHeader } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import { formatDate, formatMoney } from "@/lib/format";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Enrollment, Payment } from "@/types";

import { BalanceCard, type Balance } from "./BalanceCard";
import { EnrollmentPayments } from "./EnrollmentPayments";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `Enrolment ${(await params).id}` };
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
      <PageHeader
        back={{ href: "/enrollments", label: "Enrolments" }}
        title={student.full_name}
        eyebrow={
          <span className="tabular">
            {student.public_id} · {enrollment.course_title} (
            {enrollment.course_public_id})
          </span>
        }
        badge={<StatusBadge status={enrollment.status} />}
        actions={
          <>
            <LinkButton
              href={`/courses/${enrollment.course_public_id}`}
              icon="book"
            >
              Course
            </LinkButton>
            {can(session, "user.view") ? (
              <LinkButton href={`/users/${student.public_id}`} icon="user">
                Profile
              </LinkButton>
            ) : null}
          </>
        }
      />

      <Card>
        <CardHeader
          title="Enrolment"
          description="One student, one course — and everything attached to that pairing."
          icon="graduation"
          divider
          className="mb-5"
        />
        <DescriptionList
          items={[
            {
              label: "Enrolled",
              value: (
                <span className="tabular">{formatDate(enrollment.enrolled_at)}</span>
              ),
            },
            student.age !== null && student.age !== undefined
              ? { label: "Age", value: String(student.age) }
              : null,
            student.wilaya ? { label: "Wilaya", value: student.wilaya } : null,
            student.prior_level
              ? { label: "Prior level", value: student.prior_level }
              : null,
            student.phone
              ? { label: "Phone", value: <span className="tabular">{student.phone}</span> }
              : null,
            showsMoney
              ? {
                  label: "Price agreed at enrolment",
                  value: (
                    <span className="tabular font-medium">
                      {formatMoney(
                        enrollment.price_at_enrollment_minor,
                        enrollment.currency,
                      )}
                    </span>
                  ),
                }
              : null,
            enrollment.notes
              ? { label: "Notes", value: enrollment.notes, wide: true }
              : null,
          ]}
        />
      </Card>

      {balance ? <BalanceCard balance={balance} /> : null}

      {payments ? (
        <EnrollmentPayments
          payments={payments.results}
          enrollmentId={enrollment.id}
          mayRecord={can(session, "payment.create")}
        />
      ) : null}
    </div>
  );
}
