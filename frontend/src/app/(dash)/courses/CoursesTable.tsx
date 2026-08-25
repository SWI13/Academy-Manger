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
      empty="No courses match these filters."
    />
  );
}
