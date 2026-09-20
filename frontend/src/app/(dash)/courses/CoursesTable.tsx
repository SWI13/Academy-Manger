"use client";

import { useCan } from "@/components/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import type { Course } from "@/types";
import { useDict } from "@/components/LocaleProvider";

import { courseColumns } from "./columns";

export function CoursesTable({ rows }: { rows: Course[] }) {
  const d = useDict();
  const can = useCan();

  return (
    <DataTable
      caption={d.nav.courses}
      columns={courseColumns(can, d)}
      rows={rows}
      rowKey={(course) => course.public_id}
      rowHref={(course) => `/courses/${course.public_id}`}
      emptyIcon="book"
      empty={d.courses.emptyTitle}
      emptyDescription={d.courses.emptyBody}
    />
  );
}
