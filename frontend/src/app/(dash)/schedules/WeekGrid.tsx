import Link from "next/link";

import type { Schedule } from "@/types";

/**
 * The week, as seven columns.
 *
 * The schedule is a recurring weekly pattern, not a list of dated sessions
 * (architecture D-3), so a week is the honest unit to draw. A calendar of
 * individual dates would imply per-session cancellation exists, and it does
 * not.
 *
 * Sunday first: the Algerian working week runs Sunday to Thursday, and a grid
 * starting on Monday puts the weekend in the middle of the teaching days.
 */

// Python's weekday(): Monday is 0. Rendered Sunday-first.
const DAYS = [
  { index: 6, label: "Sunday", short: "Sun" },
  { index: 0, label: "Monday", short: "Mon" },
  { index: 1, label: "Tuesday", short: "Tue" },
  { index: 2, label: "Wednesday", short: "Wed" },
  { index: 3, label: "Thursday", short: "Thu" },
  { index: 4, label: "Friday", short: "Fri" },
  { index: 5, label: "Saturday", short: "Sat" },
];

function time(value: string): string {
  // "14:30:00" -> "14:30". Seconds on a timetable are noise.
  return value.slice(0, 5);
}

export function WeekGrid({
  slots,
  showCourse = true,
}: {
  slots: Schedule[];
  showCourse?: boolean;
}) {
  if (!slots.length) {
    return (
      <p className="rounded border border-rule bg-surface px-4 py-8 text-center text-sm text-ink-soft">
        Nothing scheduled.
      </p>
    );
  }

  const byDay = new Map<number, Schedule[]>();
  for (const slot of slots) {
    const day = byDay.get(slot.weekday) ?? [];
    day.push(slot);
    byDay.set(slot.weekday, day);
  }
  for (const day of byDay.values()) {
    day.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  return (
    <div className="overflow-x-auto rounded border border-rule bg-surface">
      <div className="grid min-w-max grid-cols-7 divide-x divide-rule">
        {DAYS.map((day) => {
          const dayslots = byDay.get(day.index) ?? [];
          return (
            <div key={day.index} className="min-w-40">
              <p className="border-b border-rule px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <span className="sm:hidden">{day.short}</span>
                <span className="hidden sm:inline">{day.label}</span>
              </p>
              <ul className="flex flex-col gap-2 p-2">
                {dayslots.length === 0 ? (
                  <li className="px-1 py-2 text-xs text-ink-faint">—</li>
                ) : (
                  dayslots.map((slot) => (
                    <li
                      key={slot.id}
                      className={`rounded border px-2 py-1.5 text-sm ${
                        slot.status === "ACTIVE"
                          ? "border-accent/25 bg-accent-soft"
                          : "border-rule bg-sunk opacity-70"
                      }`}
                    >
                      <p className="tabular font-medium text-ink">
                        {time(slot.start_time)}–{time(slot.end_time)}
                      </p>
                      {showCourse ? (
                        <Link
                          href={`/courses/${slot.course_public_id}`}
                          className="block text-xs text-accent hover:underline"
                        >
                          {slot.course_title}
                        </Link>
                      ) : null}
                      {slot.room ? (
                        <p className="text-xs text-ink-soft">{slot.room}</p>
                      ) : null}
                      {slot.status && slot.status !== "ACTIVE" ? (
                        <p className="text-xs text-ink-faint">
                          {slot.status.toLowerCase()}
                        </p>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
