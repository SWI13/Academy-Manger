import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/ui/Avatar";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Card, CardHeader, SectionHeader } from "@/components/ui/Card";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { Icon } from "@/components/ui/Icon";
import { BackLink } from "@/components/ui/PageHeader";
import { getJson } from "@/lib/django";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { ROLE_LABELS, type RoleCode } from "@/lib/permissions";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { Enrollment, User } from "@/types";

import { AccountPanel } from "./AccountPanel";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `${(await params).publicId}` };
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
  const extraRoles = user.roles.filter((code) => code !== user.primary_role);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/users" label="People" />

      {/* --- the identity card ---------------------------------------- */}
      <Card>
        <div className="flex flex-wrap items-start gap-5">
          <Avatar
            name={user.full_name}
            seed={user.public_id}
            size="xl"
            className="ring-4 ring-sunk"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-semibold text-ink">
                {user.full_name}
              </h1>
              <StatusBadge status={user.status} />
            </div>

            <p className="tabular mt-1 text-sm text-ink-soft">
              {user.public_id}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge tone="accent" size="sm">
                {ROLE_LABELS[user.primary_role as RoleCode] ?? user.primary_role}
                {" · primary"}
              </Badge>
              {extraRoles.map((code) => (
                <Badge key={code} tone="info" size="sm">
                  {ROLE_LABELS[code as RoleCode] ?? code}
                </Badge>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="phone" size={14} className="text-ink-faint" />
                <span className="tabular">{user.phone || "—"}</span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Icon name="mail" size={14} className="text-ink-faint" />
                <span className="truncate">{user.email || "—"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="clock" size={14} className="text-ink-faint" />
                {user.last_login ? (
                  <span className="tabular">
                    {formatDateTime(user.last_login)}
                  </span>
                ) : (
                  <span className="text-ink-faint">never signed in</span>
                )}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="user-plus" size={14} className="text-ink-faint" />
                <span className="tabular">{formatDate(user.created_at)}</span>
              </span>
            </div>
          </div>
        </div>
      </Card>

      {student ? (
        <Card>
          <CardHeader
            title="Student record"
            icon="graduation"
            divider
            className="mb-5"
          />
          <DescriptionList
            items={[
              {
                label: "Date of birth",
                // Age is derived, never stored - a stored age is wrong within
                // a year.
                value: student.date_of_birth ? (
                  <span className="tabular">
                    {formatDate(student.date_of_birth)}
                    {student.age !== null ? ` · ${student.age} years old` : ""}
                  </span>
                ) : (
                  "—"
                ),
              },
              { label: "Wilaya", value: student.wilaya_name || "—" },
              { label: "Prior level", value: student.prior_level || "—" },
              { label: "Address", value: student.address || "—" },
              {
                label: "Emergency contact",
                value: student.emergency_contact_name
                  ? `${student.emergency_contact_name} · ${
                      student.emergency_contact_phone || "no number"
                    }`
                  : "—",
              },
              // Absent entirely when the student is looking at their own
              // record: the serializer drops it, so there is nothing to hide.
              student.notes
                ? { label: "Staff notes", value: student.notes, wide: true }
                : null,
            ]}
          />
        </Card>
      ) : null}

      {professor ? (
        <Card>
          <CardHeader
            title="Professor record"
            icon="book"
            divider
            className="mb-5"
          />
          <DescriptionList
            items={[
              {
                label: "Specialisation",
                value: professor.specialisation || "—",
              },
              { label: "Wilaya", value: professor.wilaya_name || "—" },
              {
                label: "Hired",
                value: professor.hired_at ? (
                  <span className="tabular">
                    {formatDate(professor.hired_at)}
                  </span>
                ) : (
                  "—"
                ),
              },
              // Pay is financial data. The serializer sends it only to holders
              // of report.view_financial, so its absence here is the API's
              // decision, not this page's.
              professor.hourly_rate_minor !== undefined &&
              professor.hourly_rate_minor !== null
                ? {
                    label: "Hourly rate",
                    value: (
                      <span className="tabular">
                        {formatMoney(
                          professor.hourly_rate_minor,
                          professor.currency,
                        )}
                      </span>
                    ),
                  }
                : null,
              {
                label: "Qualifications",
                value: professor.qualifications || "—",
                wide: true,
              },
            ]}
          />
        </Card>
      ) : null}

      {enrolments?.results.length ? (
        <section>
          <SectionHeader
            title="Enrolments"
            description={`${enrolments.results.length} on record`}
          />
          <ul className="flex flex-col gap-2">
            {enrolments.results.map((enrolment) => (
              <li key={enrolment.id}>
                <Link
                  href={`/enrollments/${enrolment.id}`}
                  className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-surface px-4 py-3 shadow-xs transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink transition-colors group-hover:text-accent">
                      {enrolment.course_title}
                    </span>
                    <span className="tabular block text-xs text-ink-faint">
                      {enrolment.course_public_id} ·{" "}
                      {formatDate(enrolment.enrolled_at)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    <StatusBadge status={enrolment.status} />
                    <Icon
                      name="chevron-right"
                      size={16}
                      className="text-ink-faint transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <AccountPanel user={user} />
    </div>
  );
}
