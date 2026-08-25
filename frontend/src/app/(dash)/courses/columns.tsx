"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/ui/Badge";
import type { Column } from "@/components/ui/DataTable";
import { Meter } from "@/components/ui/Stars";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Permission } from "@/lib/permissions";
import type { Course } from "@/types";

/**
 * The catalogue row.
 *
 * Price is the interesting column. The serializer strips `price_minor`
 * entirely for anyone without `payment.view`, so for a professor or a student
 * the field is not merely hidden here - it never arrived. This factory only
 * declines to build a column for data it will not be sent.
 */
export function courseColumns(
  can: (permission: Permission) => boolean,
): Column<Course>[] {
  const columns: Column<Course>[] = [
    {
      key: "title",
      header: "Course",
      lead: true,
      cell: (course) => (
        <Link
          href={`/courses/${course.public_id}`}
          className="group/link block min-w-0"
        >
          <span className="block truncate font-medium text-ink transition-colors group-hover/link:text-accent">
            {course.title}
          </span>
          <span className="tabular block truncate text-xs text-ink-faint">
            {course.public_id}
          </span>
        </Link>
      ),
    },
    {
      key: "dates",
      header: "Runs",
      secondary: true,
      cell: (course) => (
        <span className="tabular whitespace-nowrap text-ink-soft">
          {formatDate(course.start_date)} — {formatDate(course.end_date)}
        </span>
      ),
    },
    {
      key: "professors",
      header: "Taught by",
      secondary: true,
      cell: (course) =>
        course.professors.length ? (
          <ul className="text-ink-soft">
            {course.professors.map((assignment) => (
              <li key={assignment.id} className="truncate">
                {assignment.professor.full_name}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-ink-faint">Unassigned</span>
        ),
    },
    {
      key: "seats",
      header: "Seats",
      numeric: true,
      cell: (course) => (
        // Capacity is optional in the model, so an uncapped course gets the
        // count and no bar - a meter with no maximum is a bar that is always
        // full or always empty, and both are lies.
        <span className="inline-flex min-w-24 flex-col items-end gap-1.5">
          <span className="tabular text-ink">
            {formatNumber(course.seats_taken)}
            {course.capacity ? (
              <span className="text-ink-faint"> / {formatNumber(course.capacity)}</span>
            ) : null}
          </span>
          {course.capacity ? (
            <Meter
              value={course.seats_taken}
              max={course.capacity}
              tone={course.seats_taken >= course.capacity ? "warn" : "accent"}
              label={`${course.seats_taken} of ${course.capacity} seats taken`}
              className="w-20"
            />
          ) : null}
        </span>
      ),
    },
  ];

  if (can("payment.view")) {
    columns.push({
      key: "price",
      header: "Price",
      numeric: true,
      cell: (course) => (
        <span className="font-medium text-ink">
          {formatMoney(course.price_minor, course.currency)}
        </span>
      ),
    });
  }

  columns.push({
    key: "status",
    header: "Status",
    trail: true,
    width: "1%",
    cell: (course) => <StatusBadge status={course.status} />,
  });

  return columns;
}
