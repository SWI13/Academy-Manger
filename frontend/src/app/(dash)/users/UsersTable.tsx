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
      rowHref={(user) => `/users/${user.public_id}`}
      emptyIcon="users"
      empty="Nobody matches these filters"
      emptyDescription="Accounts you cannot reach are not listed at all — the search only covers the people your role can see."
    />
  );
}
