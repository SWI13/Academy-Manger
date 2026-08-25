"use client";

import { useCan } from "@/components/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import type { Payment } from "@/types";

import { paymentColumns } from "./columns";

export function PaymentsTable({ rows }: { rows: Payment[] }) {
  const can = useCan();

  return (
    <DataTable
      caption="Payments"
      columns={paymentColumns(can)}
      rows={rows}
      rowKey={(payment) => payment.public_id}
      rowHref={(payment) => `/payments/${payment.public_id}`}
      emptyIcon="wallet"
      empty="No payments match these filters"
      emptyDescription="Nothing recorded in this range. Clearing the filters shows the whole ledger."
    />
  );
}
