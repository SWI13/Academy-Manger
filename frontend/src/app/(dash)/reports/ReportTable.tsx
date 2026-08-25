import { formatMoney, formatNumber } from "@/lib/format";

/**
 * A report's rows, whatever shape they are.
 *
 * The three reports have different columns, so the table is built from the
 * keys of the first row rather than from a hard-coded list. That is
 * deliberate: adding a column to a report should be a change in
 * `queries.py` and nothing else. A `*_minor` suffix is the signal to format
 * as money — the same convention the API uses to say "these are integer minor
 * units, not a decimal".
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
    return formatMoney(value, currency);
  }
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

export function ReportTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) {
    return (
      <p className="rounded border border-rule bg-surface px-4 py-10 text-center text-sm text-ink-soft">
        Nothing matches these filters.
      </p>
    );
  }

  // `currency` is a column on the row, not a global: two courses could in
  // principle be priced in different currencies, and formatting them all as
  // one would be a quiet lie.
  const keys = Object.keys(rows[0]).filter((key) => key !== "currency");

  return (
    <div className="overflow-x-auto rounded border border-rule bg-surface">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-rule">
            {keys.map((key) => (
              <th
                key={key}
                scope="col"
                className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint ${
                  typeof rows[0][key] === "number" ? "text-right" : "text-left"
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
              className="border-b border-rule last:border-b-0 hover:bg-sunk/60"
            >
              {keys.map((key) => (
                <td
                  key={key}
                  className={`px-3 py-2 ${
                    typeof row[key] === "number"
                      ? "tabular text-right"
                      : "text-left"
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
