"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/ui/Badge";
import { PersonCell } from "@/components/ui/Avatar";
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
      lead: true,
      cell: (enrollment) => (
        <PersonCell
          name={enrollment.student.full_name}
          publicId={enrollment.student.public_id}
        />
      ),
    },
    {
      key: "course",
      header: "Course",
      cell: (enrollment) => (
        <Link
          href={`/courses/${enrollment.course_public_id}`}
          className="block min-w-0 hover:text-accent"
        >
          <span className="block truncate text-ink">{enrollment.course_title}</span>
          <span className="tabular block truncate text-xs text-ink-faint">
            {enrollment.course_public_id}
          </span>
        </Link>
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
        cell: (enrollment) => (
          <span className="text-ink-soft">
            {enrollment.student.prior_level || "—"}
          </span>
        ),
      },
      {
        key: "wilaya",
        header: "Wilaya",
        secondary: true,
        cell: (enrollment) => (
          <span className="text-ink-soft">{enrollment.student.wilaya || "—"}</span>
        ),
      },
    );
  }

  if (can("payment.view")) {
    columns.push({
      key: "price",
      header: "Agreed price",
      numeric: true,
      cell: (enrollment) => (
        <span className="font-medium text-ink">
          {formatMoney(
            enrollment.price_at_enrollment_minor,
            enrollment.currency,
          )}
        </span>
      ),
    });
  }

  columns.push(
    {
      key: "enrolled_at",
      header: "Enrolled",
      secondary: true,
      cell: (enrollment) => (
        <span className="tabular whitespace-nowrap text-ink-soft">
          {formatDate(enrollment.enrolled_at)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      trail: true,
      width: "1%",
      cell: (enrollment) => <StatusBadge status={enrollment.status} />,
    },
  );

  return columns;
}
