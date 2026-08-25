"use client";

import { useCan } from "@/components/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import type { Enrollment } from "@/types";

import { enrollmentColumns } from "./columns";

export function EnrollmentsTable({ rows }: { rows: Enrollment[] }) {
  const can = useCan();

  return (
    <DataTable
      caption="Enrolments"
      columns={enrollmentColumns(can)}
      rows={rows}
      rowKey={(enrollment) => String(enrollment.id)}
      empty="No enrolments match these filters."
    />
  );
}
