import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import type { Schedule } from "@/types";

/**
 * The week, as a time grid.
 *
 * The schedule is a recurring weekly pattern, not a list of dated sessions
 * (architecture D-3), so a week is the honest unit to draw. A calendar of
 * individual dates would imply per-session cancellation exists, and it does
 * not.
 *
 * Sunday first: the Algerian working week runs Sunday to Thursday, and a grid
 * starting on Monday puts the weekend in the middle of the teaching days.
 *
 * Blocks are positioned by time rather than stacked in order, so a two-hour
 * class is twice the height of a one-hour class and a gap in the morning
 * looks like a gap. The hours drawn are the hours in use - a grid from
 * midnight to midnight is mostly empty space on any real timetable.
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

/** Five tints, assigned per course so one course is one colour all week. */
const TINTS = [
  "border-accent-line bg-accent-soft text-accent",
  "border-info-line bg-info-wash text-info",
  "border-ok-line bg-ok-wash text-ok",
  "border-warn-line bg-warn-wash text-warn",
  "border-rule-strong bg-sunk text-ink-soft",
] as const;

const ROW_HEIGHT = 56; // pixels per hour

function minutes(value: string): number {
  const [hours, mins] = value.split(":");
  return Number(hours) * 60 + Number(mins);
}

function time(value: string): string {
  // "14:30:00" -> "14:30". Seconds on a timetable are noise.
  return value.slice(0, 5);
}

function tintFor(courseId: string): string {
  let hash = 0;
  for (let index = 0; index < courseId.length; index += 1) {
    hash = (hash * 31 + courseId.charCodeAt(index)) >>> 0;
  }
  return TINTS[hash % TINTS.length];
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
      <EmptyState
        icon="calendar"
        title="No classes scheduled"
        description="Your weekly schedule will appear here when a course is assigned."
      />
    );
  }

  // The window to draw: the hour before the earliest start and the hour after
  // the latest end, clamped to something sane if the data is odd.
  const starts = slots.map((slot) => minutes(slot.start_time));
  const ends = slots.map((slot) => minutes(slot.end_time));
  const from = Math.max(0, Math.floor(Math.min(...starts) / 60) * 60 - 0);
  const to = Math.min(24 * 60, Math.ceil(Math.max(...ends) / 60) * 60);
  const span = Math.max(60, to - from);
  const hours = Array.from(
    { length: Math.ceil(span / 60) + 1 },
    (_, index) => from + index * 60,
  );

  const byDay = new Map<number, Schedule[]>();
  for (const slot of slots) {
    const day = byDay.get(slot.weekday) ?? [];
    day.push(slot);
    byDay.set(slot.weekday, day);
  }

  return (
    <div className="scroll-slim overflow-x-auto rounded-xl border border-rule bg-surface shadow-xs">
      <div className="min-w-[46rem]">
        {/* --- the day headings ------------------------------------- */}
        <div className="sticky top-0 z-10 grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-rule bg-sunk/60 backdrop-blur">
          <div />
          {DAYS.map((day) => (
            <div
              key={day.index}
              className="border-l border-rule px-2 py-2.5 text-center"
            >
              <p className="eyebrow">
                <span className="lg:hidden">{day.short}</span>
                <span className="hidden lg:inline">{day.label}</span>
              </p>
              <p className="tabular mt-0.5 text-[11px] text-ink-faint">
                {(byDay.get(day.index) ?? []).length || "—"}
              </p>
            </div>
          ))}
        </div>

        {/* --- the grid itself --------------------------------------- */}
        <div
          className="relative grid grid-cols-[3.5rem_repeat(7,1fr)]"
          style={{ height: (span / 60) * ROW_HEIGHT }}
        >
          {/* hour labels and their rules */}
          <div className="relative">
            {hours.map((hour) => (
              <span
                key={hour}
                className="tabular absolute right-2 -translate-y-1/2 text-[11px] text-ink-faint"
                style={{ top: ((hour - from) / 60) * ROW_HEIGHT }}
              >
                {String(Math.floor(hour / 60)).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          {DAYS.map((day) => (
            <div key={day.index} className="relative border-l border-rule">
              {hours.slice(0, -1).map((hour) => (
                <span
                  key={hour}
                  aria-hidden
                  className="absolute inset-x-0 border-t border-rule/70"
                  style={{ top: ((hour - from) / 60) * ROW_HEIGHT }}
                />
              ))}

              {(byDay.get(day.index) ?? []).map((slot) => {
                const top =
                  ((minutes(slot.start_time) - from) / 60) * ROW_HEIGHT;
                const height = Math.max(
                  26,
                  ((minutes(slot.end_time) - minutes(slot.start_time)) / 60) *
                    ROW_HEIGHT,
                );
                const inactive = slot.status && slot.status !== "ACTIVE";

                const body = (
                  <>
                    <p className="tabular truncate text-[11px] font-semibold leading-tight">
                      {time(slot.start_time)}–{time(slot.end_time)}
                    </p>
                    {showCourse ? (
                      <p className="truncate text-[11px] leading-tight opacity-90">
                        {slot.course_title}
                      </p>
                    ) : null}
                    {slot.room && height > 44 ? (
                      <p className="truncate text-[10.5px] leading-tight opacity-70">
                        {slot.room}
                      </p>
                    ) : null}
                  </>
                );

                return (
                  <div
                    key={slot.id}
                    className="absolute inset-x-1"
                    style={{ top, height }}
                  >
                    {showCourse ? (
                      <Link
                        href={`/courses/${slot.course_public_id}`}
                        title={`${slot.course_title} · ${time(slot.start_time)}–${time(
                          slot.end_time,
                        )}${slot.room ? ` · ${slot.room}` : ""}`}
                        className={`flex h-full flex-col justify-start overflow-hidden rounded-lg border px-2 py-1.5 transition-[filter,box-shadow] hover:shadow-sm hover:brightness-[0.98] ${tintFor(
                          slot.course_public_id,
                        )} ${inactive ? "opacity-55" : ""}`}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div
                        className={`flex h-full flex-col justify-start overflow-hidden rounded-lg border px-2 py-1.5 ${tintFor(
                          slot.course_public_id,
                        )} ${inactive ? "opacity-55" : ""}`}
                      >
                        {body}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The same week as a list, for a phone.
 *
 * A seven-column grid on a 375px screen is seven columns of nothing legible.
 * The days are the same order and the slots the same rows; only the shape
 * changes.
 */
export function WeekList({
  slots,
  showCourse = true,
}: {
  slots: Schedule[];
  showCourse?: boolean;
}) {
  if (!slots.length) return null;

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
    <div className="flex flex-col gap-4">
      {DAYS.map((day) => {
        const dayslots = byDay.get(day.index) ?? [];
        if (!dayslots.length) return null;

        return (
          <section key={day.index}>
            <h3 className="eyebrow mb-2">{day.label}</h3>
            <ul className="flex flex-col gap-2">
              {dayslots.map((slot) => (
                <li
                  key={slot.id}
                  className={`flex items-center gap-3 rounded-xl border bg-surface p-3 shadow-xs ${
                    slot.status && slot.status !== "ACTIVE" ? "opacity-60" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex w-16 shrink-0 flex-col items-center rounded-lg border px-1 py-1.5 ${tintFor(
                      slot.course_public_id,
                    )}`}
                  >
                    <span className="tabular text-[11px] font-semibold">
                      {time(slot.start_time)}
                    </span>
                    <span className="tabular text-[10px] opacity-70">
                      {time(slot.end_time)}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    {showCourse ? (
                      <Link
                        href={`/courses/${slot.course_public_id}`}
                        className="block truncate text-sm font-medium text-ink"
                      >
                        {slot.course_title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-ink">Class</p>
                    )}
                    {slot.room ? (
                      <p className="flex items-center gap-1 truncate text-xs text-ink-faint">
                        <Icon name="pin" size={12} />
                        {slot.room}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
