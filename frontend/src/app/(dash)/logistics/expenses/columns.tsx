"use client";

import Link from "next/link";

import type { Column } from "@/components/ui/DataTable";
import type { Dict } from "@/lib/dict/en";
import { formatDate, formatMoney } from "@/lib/format";
import type { Permission } from "@/lib/permissions";
import type { Expense } from "@/types";

/**
 * The expense ledger's columns.
 *
 * The amount is the column the eye goes to, so it is the one that carries
 * weight and tabular figures. Nothing here computes a total: the figure at
 * the bottom of this screen comes from the summary endpoint, and a browser
 * that adds up a page of twenty-five rows and calls it "March" would be
 * wrong on every page but the first.
 */
export function expenseColumns(
  can: (permission: Permission) => boolean,
  d: Dict,
): Column<Expense>[] {
  const mayManage = can("expense.manage");

  const columns: Column<Expense>[] = [
    {
      key: "name",
      header: d.logistics.name,
      lead: true,
      cell: (expense) => (
        <div className="min-w-0">
          {mayManage ? (
            <Link
              href={`/logistics/expenses/${expense.public_id}/edit`}
              className="font-medium text-ink hover:text-accent"
            >
              {expense.name}
            </Link>
          ) : (
            <span className="font-medium text-ink">{expense.name}</span>
          )}
          <p className="tabular truncate text-xs text-ink-faint">
            {expense.public_id}
            {expense.reference ? ` · ${expense.reference}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "category",
      header: d.logistics.category,
      cell: (expense) => (
        <span className="text-ink-soft">{expense.category_name}</span>
      ),
    },
    {
      key: "spent_on",
      header: d.logistics.spentOn,
      secondary: true,
      cell: (expense) => (
        <span className="tabular whitespace-nowrap text-ink-soft">
          {formatDate(expense.spent_on)}
        </span>
      ),
    },
    {
      key: "method",
      header: d.logistics.method,
      secondary: true,
      cell: (expense) =>
        expense.method ? (
          <span className="capitalize text-ink-soft">
            {expense.method.replace(/_/g, " ").toLowerCase()}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: "amount",
      header: d.logistics.amount,
      numeric: true,
      trail: true,
      cell: (expense) => (
        <span className="font-semibold text-ink">
          {formatMoney(expense.amount_minor, expense.currency ?? "DZD")}
        </span>
      ),
    },
  ];

  if (mayManage) {
    columns.splice(columns.length - 1, 0, {
      key: "notes",
      header: d.logistics.notes,
      secondary: true,
      cell: (expense) => (
        <span className="line-clamp-2 text-xs text-ink-faint">
          {expense.notes || "—"}
        </span>
      ),
    });
  }

  return columns;
}
