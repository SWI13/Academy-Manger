import { notFound } from "next/navigation";

import { getJson } from "@/lib/django";
import { formatDate } from "@/lib/format";
import { getDict } from "@/lib/i18n.server";
import { cookieHeader } from "@/lib/session";
import type { SessionSheet } from "@/types";

import { printGuard } from "../../../guard";
import { RegisterPrintSheet } from "./RegisterPrintSheet";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const d = await getDict();
  return { title: `${d.print.attendanceRegister} ${(await params).id}` };
}

/**
 * ATTENDANCE REGISTER - one class, one day.
 *
 * The same `sheet` payload the screen uses, so the register on paper and the
 * register on screen cannot show different people.
 */
export default async function PrintRegisterPage({ params }: Props) {
  const d = await getDict();
  const { id } = await params;
  const { organisation, session } = await printGuard("attendance.view");

  const sheet = await getJson<SessionSheet>(
    `/api/v1/attendance/sessions/${id}/sheet/`,
    await cookieHeader(),
  );
  if (!sheet) notFound();

  return (
    <RegisterPrintSheet
      organisation={organisation}
      sheet={sheet}
      preparedBy={session.full_name}
      filters={[
        { label: d.attendance.classLabel, value: sheet.session.course_public_id },
        { label: d.attendance.heldOn, value: formatDate(sheet.session.held_on) },
        ...(sheet.session.room
          ? [{ label: d.attendance.room, value: sheet.session.room }]
          : []),
        ...(sheet.session.topic
          ? [{ label: d.attendance.topic, value: sheet.session.topic }]
          : []),
      ]}
    />
  );
}
