"use client";

import { useDict } from "@/components/LocaleProvider";
import { useCan } from "@/components/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import type { LogisticsItem } from "@/types";

import { itemColumns } from "./columns";

export function LogisticsTable({ rows }: { rows: LogisticsItem[] }) {
  const d = useDict();
  const can = useCan();

  return (
    <DataTable
      caption={d.logistics.inventory}
      columns={itemColumns(can, d)}
      rows={rows}
      rowKey={(item) => item.public_id}
      rowHref={(item) => `/logistics/${item.public_id}`}
      emptyIcon="layers"
      empty={d.logistics.emptyTitle}
      emptyDescription={d.logistics.emptyBody}
    />
  );
}
