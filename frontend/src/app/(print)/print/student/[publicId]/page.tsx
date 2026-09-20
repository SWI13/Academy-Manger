import { notFound } from "next/navigation";

import { getJson } from "@/lib/django";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { getDict } from "@/lib/i18n.server";
import { label } from "@/lib/print";
import { can, cookieHeader, getSession } from "@/lib/session";
import type {
  AttendanceSummary,
  Enrollment,
  Payment,
  User,
} from "@/types";

import { PrintDocument } from "../../../PrintDocument";
import { printGuard } from "../../../guard";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props) {
  const d = await getDict();
  return { title: `${d.print.studentProfile} ${(await params).publicId}` };
}

/**
 * STUDENT PROFILE - one person, on one sheet.
 *
 * ---------------------------------------------------------------------------
 * "Do not print sensitive information unless the user has permission"
 * ---------------------------------------------------------------------------
 * Handled by not asking for it. Each block below is fetched only when the
 * caller holds the permission that governs it: no `payment.view`, no request
 * to the payments endpoint, and therefore nothing on the paper and nothing in
 * the network tab either. An unauthorised request that returns null is still
 * a request, and a block hidden by CSS is not hidden at all.
 *
 * The address, the date of birth and the emergency contact come from the
 * student profile, which the API only nests for callers who may read it -
 * a professor's copy of `/users/STU-000042/` simply does not carry one.
 */
export default async function PrintStudentProfilePage({ params }: Props) {
  const d = await getDict();
  const { publicId } = await params;
  const { organisation } = await printGuard("user.view");

  const cookie = await cookieHeader();
  const session = await getSession();

  const student = await getJson<User>(`/api/v1/users/${publicId}/`, cookie);
  if (!student) notFound();

  const [enrolments, payments, attendance] = await Promise.all([
    can(session, "enrollment.view")
      ? getJson<{ results: Enrollment[] }>(
          `/api/v1/enrollments/?student=${publicId}&page_size=100`,
          cookie,
        )
      : null,
    can(session, "payment.view")
      ? getJson<{ results: Payment[] }>(
          `/api/v1/payments/?student=${publicId}&page_size=100`,
          cookie,
        )
      : null,
    can(session, "attendance.view")
      ? getJson<AttendanceSummary>(
          `/api/v1/attendance/summary/?student=${publicId}`,
          cookie,
        )
      : null,
  ]);

  const profile = student.student_profile;
  const approved = (payments?.results ?? []).filter((row) => row.status === "APPROVED");
  const currency = approved[0]?.currency ?? "DZD";
  const paid = approved.reduce((sum, row) => sum + row.amount_minor, 0);

  return (
    <PrintDocument
      organisation={organisation}
      title={d.print.studentProfile}
      subtitle={student.full_name}
      filters={[{ label: d.filters.student, value: student.public_id }]}
      columns={[]}
      rows={[]}
    >
      <section className="sheet-section keep-together">
        <h2>{d.users.whoTheyAre}</h2>
        <dl className="sheet-facts">
          <Fact label={d.columns.name} value={student.full_name} />
          <Fact label={d.filters.student} value={student.public_id} />
          <Fact label={d.users.phone} value={student.phone ?? d.users.notGiven} />
          <Fact label={d.users.email} value={student.email ?? d.users.notGiven} />
          <Fact label={d.filters.role} value={label(d.roles, student.primary_role)} />
          <Fact label={d.print.status} value={label(d.status, student.status)} />
          {profile?.date_of_birth ? (
            <Fact label={d.users.dateOfBirth} value={formatDate(profile.date_of_birth)} />
          ) : null}
          {profile?.age !== null && profile?.age !== undefined ? (
            <Fact label={d.columns.age} value={String(profile.age)} />
          ) : null}
          {profile?.address ? (
            <Fact label={d.users.address} value={profile.address} />
          ) : null}
          {profile?.wilaya_name ? (
            <Fact label={d.users.wilaya} value={profile.wilaya_name} />
          ) : null}
          {profile?.prior_level ? (
            <Fact label={d.users.priorLevel} value={profile.prior_level} />
          ) : null}
          {profile?.emergency_contact_name ? (
            <Fact
              label={d.users.emergencyContact}
              value={`${profile.emergency_contact_name}${
                profile.emergency_contact_phone
                  ? ` — ${profile.emergency_contact_phone}`
                  : ""
              }`}
            />
          ) : null}
          <Fact label={d.print.registered} value={formatDate(student.created_at)} />
        </dl>
      </section>

      {enrolments?.results.length ? (
        <section className="sheet-section">
          <h2>{d.nav.enrollments}</h2>
          <table>
            <thead>
              <tr>
                <th>{d.attendance.classLabel}</th>
                <th>{d.print.registered}</th>
                <th>{d.print.status}</th>
              </tr>
            </thead>
            <tbody>
              {enrolments.results.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="sheet-strong">{row.course_title}</span>
                    <span className="sheet-sub">{row.course_public_id}</span>
                  </td>
                  <td>{formatDate(row.enrolled_at)}</td>
                  <td>{label(d.status, row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {attendance && attendance.totals.total > 0 ? (
        <section className="sheet-section keep-together">
          <h2>{d.attendance.summary}</h2>
          <dl className="sheet-facts">
            <Fact label={d.attendance.present} value={formatNumber(attendance.totals.present)} />
            <Fact label={d.attendance.late} value={formatNumber(attendance.totals.late)} />
            <Fact label={d.attendance.absent} value={formatNumber(attendance.totals.absent)} />
            <Fact
              label={d.print.attendanceRate}
              value={
                attendance.totals.rate === null || attendance.totals.rate === undefined
                  ? d.attendance.noRate
                  : `${attendance.totals.rate}%`
              }
            />
          </dl>
        </section>
      ) : null}

      {payments ? (
        <section className="sheet-section">
          <h2>{d.nav.payments}</h2>
          {payments.results.length ? (
            <>
              <table>
                <thead>
                  <tr>
                    <th>{d.print.date}</th>
                    <th>{d.print.receiptNumber}</th>
                    <th>{d.filters.course}</th>
                    <th>{d.print.status}</th>
                    <th className="num">{d.payments.amount}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.results.map((row) => (
                    <tr key={row.public_id}>
                      <td>{formatDate(row.paid_on)}</td>
                      <td className="sheet-muted">{row.public_id}</td>
                      <td>{row.course_title}</td>
                      <td>{label(d.status, row.status)}</td>
                      <td className="num">
                        {formatMoney(row.amount_minor, row.currency ?? currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="sheet-facts" style={{ marginTop: "3mm" }}>
                <Fact label={d.payments.paid} value={formatMoney(paid, currency)} />
              </dl>
            </>
          ) : (
            <p className="sheet-muted">{d.print.nothingToPrint}</p>
          )}
        </section>
      ) : null}

      {profile?.notes && can(session, "user.update") ? (
        <section className="sheet-section keep-together">
          <h2>{d.users.staffNotes}</h2>
          <p>{profile.notes}</p>
        </section>
      ) : null}
    </PrintDocument>
  );
}

function Fact({ label: name, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
  );
}
