"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/ui/Badge";
import type { Column } from "@/components/ui/DataTable";
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
      cell: (course) => (
        <Link
          href={`/courses/${course.public_id}`}
          className="text-accent hover:underline"
        >
          <span className="block font-medium">{course.title}</span>
          <span className="tabular block text-xs text-ink-faint">
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
        <span className="text-ink-soft">
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
              <li key={assignment.id}>{assignment.professor.full_name}</li>
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
        <span>
          {formatNumber(course.seats_taken)}
          {course.capacity ? ` / ${formatNumber(course.capacity)}` : ""}
        </span>
      ),
    },
  ];

  if (can("payment.view")) {
    columns.push({
      key: "price",
      header: "Price",
      numeric: true,
      cell: (course) => formatMoney(course.price_minor, course.currency),
    });
  }

  columns.push({
    key: "status",
    header: "Status",
    cell: (course) => <StatusBadge status={course.status} />,
  });

  return columns;
}
