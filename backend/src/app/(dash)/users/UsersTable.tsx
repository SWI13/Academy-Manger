"use client";

import { useCan } from "@/components/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import type { User } from "@/types";

import { userColumns } from "./columns";

export function UsersTable({ rows }: { rows: User[] }) {
  const can = useCan();

  return (
    <DataTable
      caption="People"
      columns={userColumns(can)}
      rows={rows}
      rowKey={(user) => user.public_id}
      empty="Nobody matches these filters."
    />
  );
}
