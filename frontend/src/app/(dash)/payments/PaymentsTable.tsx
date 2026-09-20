"use client";

import { useCan } from "@/components/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import type { Payment } from "@/types";
import { useDict } from "@/components/LocaleProvider";

import { paymentColumns } from "./columns";

export function PaymentsTable({ rows }: { rows: Payment[] }) {
  const d = useDict();
  const can = useCan();

  return (
    <DataTable
      caption={d.nav.payments}
      columns={paymentColumns(can, d)}
      rows={rows}
      rowKey={(payment) => payment.public_id}
      rowHref={(payment) => `/payments/${payment.public_id}`}
      emptyIcon="wallet"
      empty={d.payments.emptyTitle}
      emptyDescription={d.payments.emptyBody}
    />
  );
}
