"use client";

import { useDict } from "@/components/LocaleProvider";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { label, type PrintColumn } from "@/lib/print";
import type { Expense, ExpensePrint, Organisation } from "@/types";

import { PrintDocument } from "../../PrintDocument";

/**
 * MONTHLY EXPENSES.
 *
 * The total under the table is the server's figure for the whole month, not a
 * sum of the rows above it. Those are the same number, and they are the same
 * number because the API says so rather than because this page added
 * correctly.
 */
export function ExpensesSheet({
  organisation,
  sheet,
  subtitle,
  intl,
}: {
  organisation: Organisation;
  sheet: ExpensePrint;
  subtitle: string;
  intl: string;
}) {
  const d = useDict();

  const summary = sheet.summary;
  const currency = summary.currency ?? "DZD";

  const columns: PrintColumn<Expense>[] = [
    {
      key: "index",
      header: "#",
      width: "4%",
      numeric: true,
      cell: (_row, index) => <span className="sheet-muted">{index + 1}</span>,
    },
    {
      key: "date",
      header: d.logistics.spentOn,
      width: "12%",
      numeric: true,
      cell: (row) => formatDate(row.spent_on, intl),
    },
    {
      key: "category",
      header: d.logistics.category,
      width: "16%",
      cell: (row) => row.category_name,
    },
    {
      key: "description",
      header: d.logistics.description,
      width: "28%",
      cell: (row) => (
        <>
          <span className="sheet-strong">{row.name}</span>
          {row.notes ? <span className="sheet-sub">{row.notes}</span> : null}
        </>
      ),
    },
    {
      key: "method",
      header: d.logistics.method,
      width: "14%",
      cell: (row) => label(d.payments, row.method, row.method || "—"),
    },
    {
      key: "reference",
      header: d.logistics.reference,
      width: "12%",
      cell: (row) => <span className="sheet-muted">{row.reference || "—"}</span>,
    },
    {
      key: "amount",
      header: d.logistics.amount,
      width: "14%",
      numeric: true,
      cell: (row) => (
        <span className="sheet-strong">
          {formatMoney(row.amount_minor, row.currency ?? currency, intl)}
        </span>
      ),
    },
  ];

  return (
    <PrintDocument
      organisation={organisation}
      title={d.logistics.expensesDocumentTitle}
      subtitle={subtitle}
      columns={columns}
      rows={sheet.results}
      rowKey={(row) => row.public_id}
      printedAt={sheet.printed_at}
      totals={[
        {
          label: d.logistics.printedTotalExpenses,
          value: formatMoney(summary.month_total_minor, currency, intl),
        },
      ]}
    >
      {summary.by_category.length ? (
        <section className="sheet-section">
          <h2>{d.logistics.breakdown}</h2>
          <table>
            <thead>
              <tr>
                <th>{d.logistics.category}</th>
                <th className="num" style={{ width: "18%" }}>
                  {d.logistics.entries}
                </th>
                <th className="num" style={{ width: "24%" }}>
                  {d.logistics.amount}
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.by_category.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td className="num">{formatNumber(row.count)}</td>
                  <td className="num sheet-strong">
                    {formatMoney(row.total_minor, currency, intl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </PrintDocument>
  );
}
