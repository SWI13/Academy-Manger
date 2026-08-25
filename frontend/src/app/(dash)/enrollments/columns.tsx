"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/ui/Badge";
import type { Column } from "@/components/ui/DataTable";
import { formatDate, formatMoney } from "@/lib/format";
import type { Permission } from "@/lib/permissions";
import type { Enrollment } from "@/types";

/**
 * The same enrolment row, seen by four different people.
 *
 * A professor holds no payment permission at all, so the price column is not
 * built for them - they see who is in the room, not who has paid. That is a
 * rule from the architecture, and here it is one `if`.
 */
export function enrollmentColumns(
  can: (permission: Permission) => boolean,
): Column<Enrollment>[] {
  const columns: Column<Enrollment>[] = [
    {
      key: "student",
      header: "Student",
      cell: (enrollment) => (
        <Link
          href={`/enrollments/${enrollment.id}`}
          className="text-accent hover:underline"
        >
          <span className="block font-medium">
            {enrollment.student.full_name}
          </span>
          <span className="tabular block text-xs text-ink-faint">
            {enrollment.student.public_id}
          </span>
        </Link>
      ),
    },
    {
      key: "course",
      header: "Course",
      cell: (enrollment) => (
        <div>
          <p className="text-ink">{enrollment.course_title}</p>
          <p className="tabular text-xs text-ink-faint">
            {enrollment.course_public_id}
          </p>
        </div>
      ),
    },
  ];

  // The roster fields, which are what a professor actually opens this for.
  if (can("score.enter")) {
    columns.push(
      {
        key: "age",
        header: "Age",
        numeric: true,
        secondary: true,
        // Never stored - derived from date of birth, because a stored age is
        // wrong within a year.
        cell: (enrollment) => enrollment.student.age ?? "—",
      },
      {
        key: "level",
        header: "Level",
        secondary: true,
        cell: (enrollment) => enrollment.student.prior_level || "—",
      },
      {
        key: "wilaya",
        header: "Wilaya",
        secondary: true,
        cell: (enrollment) => enrollment.student.wilaya || "—",
      },
    );
  }

  if (can("payment.view")) {
    columns.push({
      key: "price",
      header: "Agreed price",
      numeric: true,
      secondary: true,
      cell: (enrollment) =>
        formatMoney(enrollment.price_at_enrollment_minor, enrollment.currency),
    });
  }

  columns.push(
    {
      key: "enrolled_at",
      header: "Enrolled",
      secondary: true,
      cell: (enrollment) => formatDate(enrollment.enrolled_at),
    },
    {
      key: "status",
      header: "Status",
      cell: (enrollment) => <StatusBadge status={enrollment.status} />,
    },
  );

  return columns;
}
