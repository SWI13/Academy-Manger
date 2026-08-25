import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/ui/Badge";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { getJson } from "@/lib/django";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { ROLE_LABELS, type RoleCode } from "@/lib/permissions";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Enrollment, User } from "@/types";

import { AccountPanel } from "./AccountPanel";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `${(await params).publicId} · SM Academy` };
}

export default async function UserPage({ params }: Props) {
  const { publicId } = await params;
  const cookie = await cookieHeader();

  const user = await getJson<User>(`/api/v1/users/${publicId}/`, cookie);
  // 404 whether the account does not exist or is outside this caller's scope.
  // Reception cannot see owner accounts at all, and a 403 would confirm one
  // exists at that ID.
  if (!user) notFound();

  const session = await getSession();

  const enrolments =
    user.primary_role === "STUDENT" && can(session, "enrollment.view")
      ? await getJson<{ results: Enrollment[] }>(
          `/api/v1/enrollments/?student=${user.public_id}`,
          cookie,
        )
      : null;

  const student = user.student_profile;
  const professor = user.professor_profile;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/users" className="text-sm text-ink-soft hover:text-ink">
            ← People
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">
            {user.full_name}
          </h1>
          <p className="tabular mt-1 text-sm text-ink-soft">
            {user.public_id} ·{" "}
            {ROLE_LABELS[user.primary_role as RoleCode] ?? user.primary_role}
          </p>
        </div>
        <StatusBadge status={user.status} />
      </header>

      <section className="rounded border border-rule bg-surface p-4">
        <DescriptionList
          items={[
            { label: "Phone", value: user.phone || "—" },
            { label: "Email", value: user.email || "—" },
            { label: "Account created", value: formatDate(user.created_at) },
            {
              label: "Last signed in",
              value: user.last_login ? (
                formatDateTime(user.last_login)
              ) : (
                <span className="text-ink-faint">never</span>
              ),
            },
          ]}
        />
      </section>

      {student ? (
        <section className="rounded border border-rule bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Student record
          </h2>
          <DescriptionList
            items={[
              {
                label: "Date of birth",
                // Age is derived, never stored - a stored age is wrong within
                // a year.
                value: student.date_of_birth
                  ? `${formatDate(student.date_of_birth)}${
                      student.age !== null ? ` · ${student.age} years old` : ""
                    }`
                  : "—",
              },
              { label: "Wilaya", value: student.wilaya_name || "—" },
              { label: "Prior level", value: student.prior_level || "—" },
              { label: "Address", value: student.address || "—" },
              {
                label: "Emergency contact",
                value: student.emergency_contact_name
                  ? `${student.emergency_contact_name} · ${student.emergency_contact_phone || "no number"}`
                  : "—",
              },
              // Absent entirely when the student is looking at their own
              // record: the serializer drops it, so there is nothing to hide.
              student.notes ? { label: "Staff notes", value: student.notes } : null,
            ]}
          />
        </section>
      ) : null}

      {professor ? (
        <section className="rounded border border-rule bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Professor record
          </h2>
          <DescriptionList
            items={[
              { label: "Specialisation", value: professor.specialisation || "—" },
              { label: "Qualifications", value: professor.qualifications || "—" },
              { label: "Wilaya", value: professor.wilaya_name || "—" },
              {
                label: "Hired",
                value: professor.hired_at ? formatDate(professor.hired_at) : "—",
              },
              // Pay is financial data. The serializer sends it only to holders
              // of report.view_financial, so its absence here is the API's
              // decision, not this page's.
              professor.hourly_rate_minor !== undefined &&
              professor.hourly_rate_minor !== null
                ? {
                    label: "Hourly rate",
                    value: formatMoney(
                      professor.hourly_rate_minor,
                      professor.currency,
                    ),
                  }
                : null,
            ]}
          />
        </section>
      ) : null}

      {enrolments?.results.length ? (
        <section className="rounded border border-rule bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Enrolments
          </h2>
          <ul className="flex flex-col gap-2">
            {enrolments.results.map((enrolment) => (
              <li
                key={enrolment.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-2 last:border-b-0 last:pb-0"
              >
                <Link
                  href={`/enrollments/${enrolment.id}`}
                  className="text-sm text-accent hover:underline"
                >
                  {enrolment.course_title}{" "}
                  <span className="tabular text-ink-faint">
                    {enrolment.course_public_id}
                  </span>
                </Link>
                <StatusBadge status={enrolment.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <AccountPanel user={user} />
    </div>
  );
}
