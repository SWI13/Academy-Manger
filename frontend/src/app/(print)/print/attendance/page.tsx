import { redirect } from "next/navigation";

import { getJson } from "@/lib/django";
import { formatDate } from "@/lib/format";
import { getDict } from "@/lib/i18n.server";
import type { SearchParams } from "@/lib/list";
import { describeFilters, printQuery } from "@/lib/print";
import { cookieHeader } from "@/lib/session";
import type { AttendanceSummary } from "@/types";

import { printGuard } from "../../guard";
import { AttendanceSheet } from "./AttendanceSheet";

export const ATTENDANCE_FILTERS = ["course", "student", "from", "to"] as const;

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.print.attendanceReport };
}

/**
 * ATTENDANCE REPORT.
 *
 * Daily, weekly and monthly are the same document with a different `from` and
 * `to`, which is why there is one route rather than three: "this week" is a
 * date range, not a kind of report.
 */
export default async function PrintAttendancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const { organisation } = await printGuard("attendance.view");

  const summary = await getJson<AttendanceSummary>(
    `/api/v1/attendance/summary/?${printQuery(params, ATTENDANCE_FILTERS)}`,
    await cookieHeader(),
  );
  if (!summary) redirect("/attendance");

  return (
    <AttendanceSheet
      organisation={organisation}
      summary={summary}
      filters={describeFilters(params, [
        { param: "course", label: d.attendance.classLabel },
        { param: "student", label: d.filters.student },
        { param: "from", label: d.filters.from, resolve: (value) => formatDate(value) },
        { param: "to", label: d.filters.to, resolve: (value) => formatDate(value) },
      ])}
    />
  );
}
