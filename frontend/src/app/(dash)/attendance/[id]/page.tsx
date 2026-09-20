import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/ui/Badge";
import { NoAccess } from "@/components/ui/EmptyState";
import { Note } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrintButton } from "@/components/ui/PrintButton";
import { getJson } from "@/lib/django";
import { formatDate } from "@/lib/format";
import { getDict } from "@/lib/i18n.server";
import { can, cookieHeader, getSession } from "@/lib/session";
import type { SessionSheet } from "@/types";

import { RegisterSheet } from "./RegisterSheet";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const d = await getDict();
  return { title: `${d.attendance.title} ${(await params).id}` };
}

/**
 * One register: every name on the class, with whatever has been marked.
 *
 * The roster comes from the API rather than being assembled here, and it is
 * the same payload the printed register uses - so the sheet on screen and the
 * sheet on paper cannot show different people.
 */
export default async function RegisterPage({ params }: Props) {
  const d = await getDict();
  const { id } = await params;

  const [sheet, session] = await Promise.all([
    getJson<SessionSheet>(`/api/v1/attendance/sessions/${id}/sheet/`, await cookieHeader()),
    getSession(),
  ]);

  if (!can(session, "attendance.view")) return <NoAccess what={d.attendance.title} />;
  if (!sheet) notFound();

  const mayRecord = can(session, "attendance.record");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/attendance", label: d.attendance.title }}
        title={formatDate(sheet.session.held_on)}
        eyebrow={`${sheet.session.course_title} · ${sheet.session.course_public_id}${
          sheet.session.room ? ` · ${sheet.session.room}` : ""
        }`}
        badge={<StatusBadge status={sheet.session.status} />}
        lede={sheet.session.topic || undefined}
        actions={
          <PrintButton
            href={`/print/register/${sheet.session.id}`}
            label={d.attendance.printRegister}
          />
        }
      />

      {!mayRecord ? <Note tone="neutral" icon="lock">{d.attendance.readOnly}</Note> : null}

      {sheet.rows.length ? (
        <RegisterSheet
          sessionId={sheet.session.id}
          rows={sheet.rows}
          totals={sheet.totals}
          mayRecord={mayRecord}
        />
      ) : (
        <Note tone="neutral">{d.attendance.notOnRoster}</Note>
      )}
    </div>
  );
}
