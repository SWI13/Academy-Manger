"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/ui/Badge";
import type { Column } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import type { Dict } from "@/lib/dict/en";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import type { Permission } from "@/lib/permissions";
import type { LogisticsItem } from "@/types";

/**
 * One column factory, as everywhere else in this application.
 *
 * Reception and the owner read the same inventory. What differs is the last
 * column, and that is decided here from the caller's permissions rather than
 * by writing a second table - which is how a fix to one of them silently
 * misses the other.
 *
 * Nothing here is protection. A chair is not scoped to anybody; the reason
 * reception sees these rows is that Django sent them, and the reason
 * reception cannot change one is that Django refuses.
 */
export function itemColumns(
  can: (permission: Permission) => boolean,
  d: Dict,
): Column<LogisticsItem>[] {
  const columns: Column<LogisticsItem>[] = [
    {
      key: "name",
      header: d.logistics.name,
      lead: true,
      cell: (item) => (
        <div className="min-w-0">
          <Link
            href={`/logistics/${item.public_id}`}
            className="font-medium text-ink hover:text-accent"
          >
            {item.name}
          </Link>
          <p className="tabular truncate text-xs text-ink-faint">
            {item.public_id}
            {item.serial_number ? ` · ${item.serial_number}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "category",
      header: d.logistics.category,
      cell: (item) => <span className="text-ink-soft">{item.category_name}</span>,
    },
    {
      key: "quantity",
      header: d.logistics.quantity,
      numeric: true,
      cell: (item) => (
        // The figure people scan the column for, so it carries the weight.
        // Zero is dimmed rather than hidden: "0" is a real answer, and it is
        // the one that means the shelf is empty.
        <span
          className={`font-semibold ${item.quantity === 0 ? "text-ink-faint" : "text-ink"}`}
        >
          {formatNumber(item.quantity)}
        </span>
      ),
    },
    {
      key: "condition",
      header: d.logistics.condition,
      cell: (item) => <StatusBadge status={item.condition} size="sm" />,
    },
    {
      key: "location",
      header: d.logistics.location,
      secondary: true,
      cell: (item) =>
        item.location_name ? (
          <span className="inline-flex items-center gap-1.5 text-ink-soft">
            <Icon name="pin" size={13} className="text-ink-faint" />
            {item.location_name}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: "updated",
      header: d.logistics.lastUpdated,
      secondary: true,
      cell: (item) => (
        <span className="tabular whitespace-nowrap text-xs text-ink-faint">
          {formatDateTime(item.updated_at)}
        </span>
      ),
    },
    {
      key: "status",
      header: d.logistics.status,
      trail: true,
      width: "1%",
      cell: (item) => <StatusBadge status={item.status} />,
    },
  ];

  // What it cost. Only for whoever already sees the institute's money
  // elsewhere - the price of a projector is a commercial figure, and the
  // permission that governs the rest of them governs this one too.
  if (can("report.view_financial")) {
    columns.splice(columns.length - 1, 0, {
      key: "price",
      header: d.logistics.purchasePrice,
      numeric: true,
      secondary: true,
      cell: (item) =>
        item.purchase_price_minor === null || item.purchase_price_minor === undefined ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <span className="text-ink-soft">
            {formatMoney(item.purchase_price_minor, item.currency ?? "DZD")}
          </span>
        ),
    });
  }

  return columns;
}
