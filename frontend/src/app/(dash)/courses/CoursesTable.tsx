"use client";

import { useCan } from "@/components/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import type { Course } from "@/types";

import { courseColumns } from "./columns";

export function CoursesTable({ rows }: { rows: Course[] }) {
  const can = useCan();

  return (
    <DataTable
      caption="Courses"
      columns={courseColumns(can)}
      rows={rows}
      rowKey={(course) => course.public_id}
      rowHref={(course) => `/courses/${course.public_id}`}
      emptyIcon="book"
      empty="No courses match these filters"
      emptyDescription="Clear the filters to see the whole catalogue."
    />
  );
}
