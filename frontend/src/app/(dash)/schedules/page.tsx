import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Toolbar } from "@/components/ui/Toolbar";
import { formatNumber } from "@/lib/format";
import { fetchPage, type SearchParams } from "@/lib/list";
import type { Schedule } from "@/types";

import { WeekGrid, WeekList } from "./WeekGrid";

export const metadata = { title: "Schedule · SM Academy" };

const FILTERS = ["course", "weekday"];

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // page_size at the cap: a week is drawn as a whole, and paging a timetable
  // would cut Thursday off the bottom of the screen.
  const page = await fetchPage<Schedule>(
    "schedules",
    { ...params, page_size: "100" },
    [...FILTERS, "page_size"],
  );

  if (!page) {
    return <ErrorState title="The schedule could not be loaded" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedule"
        lede="A recurring weekly pattern, not a diary of dated sessions. Each slot runs every week between its effective dates."
      />

      <Toolbar
        filters={[
          { param: "course", label: "Course", placeholder: "C-2026-001" },
          {
            param: "weekday",
            label: "Day",
            options: [
              { value: "6", label: "Sunday" },
              { value: "0", label: "Monday" },
              { value: "1", label: "Tuesday" },
              { value: "2", label: "Wednesday" },
              { value: "3", label: "Thursday" },
              { value: "4", label: "Friday" },
              { value: "5", label: "Saturday" },
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
