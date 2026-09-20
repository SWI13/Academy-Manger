import { redirect } from "next/navigation";

import { getJson } from "@/lib/django";
import { weekdayName } from "@/lib/format";
import { LOCALE_INFO } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n.server";
import type { SearchParams } from "@/lib/list";
import { describeFilters, printQuery } from "@/lib/print";
import { cookieHeader } from "@/lib/session";
import type { SchedulePrint } from "@/types";

import { printGuard } from "../../guard";
import { ScheduleSheet } from "./ScheduleSheet";

export const SCHEDULE_FILTERS = ["course", "weekday", "professor"] as const;

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.print.scheduleTitle };
}

/**
 * CLASS SCHEDULE - the weekly pattern, on paper.
 *
 * Sorted by day and then by start time rather than by the API's default
 * ordering, because a timetable pinned to a wall is read down the week. Done
 * here rather than in the API: it is a property of this document, not of the
 * resource.
 */
export default async function PrintSchedulePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const { organisation } = await printGuard("schedule.view");
  const intl = LOCALE_INFO[await getLocale()].intl;

  const sheet = await getJson<SchedulePrint>(
    `/api/v1/schedules/print/?${printQuery(params, SCHEDULE_FILTERS)}`,
    await cookieHeader(),
  );
  if (!sheet) redirect("/schedules");

  const rows = [...sheet.results].sort(
    (a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time),
  );

  return (
    <ScheduleSheet
      organisation={organisation}
      rows={rows}
      count={sheet.count}
      intl={intl}
      printedAt={sheet.printed_at}
      truncated={sheet.truncated}
      filters={describeFilters(params, [
        {
          param: "course",
          label: d.attendance.classLabel,
          resolve: (value) =>
            rows.find((row) => row.course_public_id === value)?.course_title ?? value,
        },
        {
          param: "weekday",
          label: d.filters.day,
          resolve: (value) => weekdayName(Number(value), intl),
        },
        { param: "professor", label: d.roles.PROFESSOR },
      ])}
    />
  );
}
