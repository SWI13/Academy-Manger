import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrintButton } from "@/components/ui/PrintButton";
import { Toolbar } from "@/components/ui/Toolbar";
import { formatNumber } from "@/lib/format";
import { fetchPage, type SearchParams } from "@/lib/list";
import type { Schedule } from "@/types";
import { weekdayName } from "@/lib/format";
import { LOCALE_INFO } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n.server";

import { WeekGrid, WeekList } from "./WeekGrid";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.nav.schedules };
}

const FILTERS = ["course", "weekday"];

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const intl = LOCALE_INFO[await getLocale()].intl;
  const params = await searchParams;
  // page_size at the cap: a week is drawn as a whole, and paging a timetable
  // would cut Thursday off the bottom of the screen.
  const page = await fetchPage<Schedule>(
    "schedules",
    { ...params, page_size: "100" },
    [...FILTERS, "page_size"],
  );

  if (!page) {
    return <ErrorState title={d.schedules.errorTitle} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={d.nav.schedules}
        lede={d.schedules.lede}
        actions={
          <PrintButton href="/print/schedule" params={params} filters={["course", "weekday", "professor"]} />
        }
      />

      <Toolbar
        filters={[
          { param: "course", label: d.filters.course, placeholder: "C-2026-001" },
          {
            param: "weekday",
            label: d.filters.day,
            options: [
              { value: "6", label: weekdayName(6, intl) },
              { value: "0", label: weekdayName(0, intl) },
              { value: "1", label: weekdayName(1, intl) },
              { value: "2", label: weekdayName(2, intl) },
              { value: "3", label: weekdayName(3, intl) },
              { value: "4", label: weekdayName(4, intl) },
              { value: "5", label: weekdayName(5, intl) },
            ],
          },
        ]}
      />

      {/* The grid from md up, the same slots as a day-by-day list below. */}
      <div className="hidden md:block">
        <WeekGrid slots={page.results} />
      </div>
      <div className="md:hidden">
        {page.results.length ? (
          <WeekList slots={page.results} />
        ) : (
          <WeekGrid slots={page.results} />
        )}
      </div>

      <p className="text-[13px] text-ink-faint">
        {formatNumber(page.count)} {page.count === 1 ? "slot" : "slots"}
      </p>
    </div>
  );
}
