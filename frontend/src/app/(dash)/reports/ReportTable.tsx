import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, formatNumber } from "@/lib/format";
import { getDict } from "@/lib/i18n.server";

/**
 * A report's rows, whatever shape they are.
 *
 * The three reports have different columns, so the table is built from the
 * keys of the first row rather than from a hard-coded list. That is
 * deliberate: adding a column to a report should be a change in `queries.py`
 * and nothing else. A `*_minor` suffix is the signal to format as money — the
 * same convention the API uses to say "these are integer minor units, not a
 * decimal".
 */
function heading(key: string): string {
  const base = key.replace(/_minor$/, "").replace(/_public_id$/, " ID");
  return base.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function render(key: string, value: unknown, currency: string) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-ink-faint">—</span>;
  }
  if (key.endsWith("_minor") && typeof value === "number") {
    return <span className="font-medium">{formatMoney(value, currency)}</span>;
  }
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

export async function ReportTable({ rows }: { rows: Record<string, unknown>[] }) {
  const d = await getDict();
  if (!rows.length) {
    return (
      <EmptyState
        icon="activity"
        title={d.reports.emptyTitle}
        description={d.reports.emptyBody}
      />
    );
  }

  // `currency` is a column on the row, not a global: two courses could in
  // principle be priced in different currencies, and formatting them all as
  // one would be a quiet lie.
  const keys = Object.keys(rows[0]).filter((key) => key !== "currency");

  return (
    <div className="scroll-slim overflow-x-auto glass rounded-xl border border-rule">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-rule bg-black/40">
            {keys.map((key) => (
              <th
                key={key}
                scope="col"
                className={`eyebrow whitespace-nowrap px-4 py-2.5 ${
                  typeof rows[0][key] === "number" ? "text-end" : "text-start"
                }`}
              >
                {heading(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className="border-b border-rule transition-colors last:border-b-0 hover:bg-white/[0.06]"
            >
              {keys.map((key) => (
                <td
                  key={key}
                  className={`whitespace-nowrap px-4 py-3 ${
                    typeof row[key] === "number"
                      ? "tabular text-end text-ink"
                      : "text-start text-ink-soft"
                  }`}
                >
                  {render(key, row[key], String(row.currency ?? "DZD"))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
