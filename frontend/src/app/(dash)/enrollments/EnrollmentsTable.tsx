"use client";

import { useCan } from "@/components/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import type { Enrollment } from "@/types";
import { useDict } from "@/components/LocaleProvider";

import { enrollmentColumns } from "./columns";

export function EnrollmentsTable({ rows }: { rows: Enrollment[] }) {
  const d = useDict();
  const can = useCan();

  return (
    <DataTable
      caption={d.nav.enrollments}
      columns={enrollmentColumns(can, d)}
      rows={rows}
      rowKey={(enrollment) => String(enrollment.id)}
      rowHref={(enrollment) => `/enrollments/${enrollment.id}`}
      emptyIcon="graduation"
      empty={d.enrollments.emptyTitle}
      emptyDescription={d.enrollments.emptyBody}
    />
  );
}
