"use client";

import { useDict } from "@/components/LocaleProvider";
import { formatDate, formatNumber } from "@/lib/format";
import { label, type PrintColumn, type PrintFilter } from "@/lib/print";
import type { LogisticsItem, LogisticsPrint, Organisation } from "@/types";

import { PrintDocument } from "../../PrintDocument";

/**
 * LOGISTICS INVENTORY, on the universal document.
 *
 * It was the first printed sheet in the platform and had a layout of its own.
 * It does not any more: the masthead, the pagination, the repeated headers and
 * the page numbers all come from `PrintDocument` like every other report -
 * which is the proof that the shared system is capable enough to replace the
 * bespoke one it grew out of.
 */
export function InventorySheet({
  organisation,
  sheet,
  filters,
}: {
  organisation: Organisation;
  sheet: LogisticsPrint;
  filters: PrintFilter[];
}) {
  const d = useDict();
  const overview = sheet.overview;

  const columns: PrintColumn<LogisticsItem>[] = [
    {
      key: "index",
      header: "#",
      width: "4%",
      numeric: true,
      cell: (_row, index) => <span className="sheet-muted">{index + 1}</span>,
    },
    {
      key: "name",
      header: d.logistics.name,
      width: "26%",
      cell: (row) => (
        <>
          <span className="sheet-strong">{row.name}</span>
          <span className="sheet-sub">
            {row.public_id}
            {row.serial_number ? ` · ${row.serial_number}` : ""}
          </span>
        </>
      ),
    },
    {
      key: "category",
      header: d.logistics.category,
      width: "15%",
      cell: (row) => row.category_name,
    },
    {
      key: "quantity",
      header: d.logistics.quantity,
      width: "8%",
      numeric: true,
      cell: (row) => <span className="sheet-strong">{formatNumber(row.quantity)}</span>,
    },
    {
      key: "condition",
      header: d.logistics.condition,
      width: "12%",
      cell: (row) => label(d.status, row.condition),
    },
    {
      key: "location",
      header: d.logistics.location,
      width: "13%",
      cell: (row) => row.location_name ?? "—",
    },
    {
      key: "status",
      header: d.logistics.status,
      width: "11%",
      cell: (row) => label(d.status, row.status),
    },
    {
      key: "notes",
      header: d.logistics.notes,
      width: "11%",
      cell: (row) => (
        <span className="sheet-muted">
          {row.notes || (row.purchase_date ? formatDate(row.purchase_date) : "")}
        </span>
      ),
    },
  ];

  return (
    <PrintDocument
      organisation={organisation}
      title={d.logistics.documentTitle}
      filters={filters}
      columns={columns}
      rows={sheet.results}
      rowKey={(row) => row.public_id}
      printedAt={sheet.printed_at}
      totals={[
        // Both ways of counting, because both questions get asked: how many
        // lines match, and how many actual objects they describe.
        { label: d.logistics.printedTotalItems, value: formatNumber(overview.units_total) },
        { label: d.logistics.printedTotalLines, value: formatNumber(overview.items_total) },
      ]}
    >
      {overview.needs_repair_items || overview.damaged_items || overview.missing_items ? (
        <p className="sheet-note">
          {d.logistics.needingRepair}: {formatNumber(overview.needs_repair_units)} ·{" "}
          {d.logistics.damaged}: {formatNumber(overview.damaged_units)} ·{" "}
          {d.logistics.missing}: {formatNumber(overview.missing_units)}
        </p>
      ) : null}
    </PrintDocument>
  );
}
