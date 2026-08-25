import { Toolbar } from "@/components/ui/Toolbar";
import { fetchPage, type SearchParams } from "@/lib/list";
import type { Schedule } from "@/types";

import { WeekGrid } from "./WeekGrid";

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
    return (
      <p className="text-sm text-ink-soft">
        The schedule could not be loaded. Try refreshing.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Schedule
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          A recurring weekly pattern, not a diary of dated sessions. Each slot
          runs every week between its effective dates.
        </p>
      </header>

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

      <WeekGrid slots={page.results} />

      <p className="text-sm text-ink-faint">
        {page.count} {page.count === 1 ? "slot" : "slots"}
      </p>
    </div>
  );
}
