"use client";

import { useCan } from "@/components/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import type { User } from "@/types";
import { useDict } from "@/components/LocaleProvider";

import { userColumns } from "./columns";

export function UsersTable({ rows }: { rows: User[] }) {
  const d = useDict();
  const can = useCan();

  return (
    <DataTable
      caption={d.nav.users}
      columns={userColumns(can, d)}
      rows={rows}
      rowKey={(user) => user.public_id}
      rowHref={(user) => `/users/${user.public_id}`}
      emptyIcon="users"
      empty={d.users.emptyTitle}
      emptyDescription={d.users.emptyBody}
    />
  );
}
