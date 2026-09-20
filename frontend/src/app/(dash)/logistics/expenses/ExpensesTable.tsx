"use client";

import { useDict } from "@/components/LocaleProvider";
import { useCan } from "@/components/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import type { Expense } from "@/types";

import { expenseColumns } from "./columns";

export function ExpensesTable({ rows }: { rows: Expense[] }) {
  const d = useDict();
  const can = useCan();

  // No `rowHref` for reception. A row that navigates to a form they cannot
  // submit is a dead end dressed up as an action; for them the ledger is
  // something to read.
  const mayManage = can("expense.manage");

  return (
    <DataTable
      caption={d.logistics.expensesTitle}
      columns={expenseColumns(can, d)}
      rows={rows}
      rowKey={(expense) => expense.public_id}
      rowHref={
        mayManage
          ? (expense) => `/logistics/expenses/${expense.public_id}/edit`
          : undefined
      }
      emptyIcon="receipt"
      empty={d.logistics.expensesEmptyTitle}
      emptyDescription={d.logistics.expensesEmptyBody}
    />
  );
}
