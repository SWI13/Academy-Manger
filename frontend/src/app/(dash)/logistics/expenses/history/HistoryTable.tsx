"use client";

import Link from "next/link";

import { useDict } from "@/components/LocaleProvider";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatMoney, formatNumber } from "@/lib/format";
import { periodLabel } from "@/lib/logistics";
import type { ExpenseHistoryRow } from "@/types";

/**
 * The months, as rows.
 *
 * Reuses the application's one table rather than hand-rolling a second: the
 * card layout below `md`, the empty state and the row-opens-the-record
 * behaviour all come with it, and a bespoke `<table>` here would be the one
 * screen that behaves differently on a phone.
 */
export function HistoryTable({
  rows,
  intl,
}: {
  rows: ExpenseHistoryRow[];
  intl: string;
}) {
  const d = useDict();

  const columns: Column<ExpenseHistoryRow>[] = [
    {
      key: "month",
      header: d.logistics.monthColumn,
      lead: true,
      cell: (row) => (
        <Link
          href={`/logistics/expenses?year=${row.year}&month=${row.month}`}
          className="font-medium text-ink hover:text-accent"
        >
          {periodLabel({ year: row.year, month: row.month }, intl)}
        </Link>
      ),
    },
    {
      key: "total",
      header: d.logistics.totalColumn,
      numeric: true,
      cell: (row) => (
        <span className="font-semibold text-ink">
          {formatMoney(row.total_minor, row.currency ?? "DZD")}
        </span>
      ),
    },
    {
      key: "category",
      header: d.logistics.mainCategory,
      trail: true,
      cell: (row) =>
        row.top_category ? (
          <Badge tone="neutral">{row.top_category}</Badge>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: "entries",
      header: d.logistics.entries,
      numeric: true,
      secondary: true,
      cell: (row) => (
        <span className="text-ink-faint">{formatNumber(row.count)}</span>
      ),
    },
  ];

  return (
    <DataTable
      caption={d.logistics.historyTitle}
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.year}-${row.month}`}
      rowHref={(row) => `/logistics/expenses?year=${row.year}&month=${row.month}`}
      emptyIcon="clock"
      empty={d.logistics.historyEmptyTitle}
      emptyDescription={d.logistics.historyEmptyBody}
    />
  );
}
