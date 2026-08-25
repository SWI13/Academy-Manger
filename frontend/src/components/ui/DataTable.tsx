import type { ReactNode } from "react";

/**
 * One table, many column sets.
 *
 * The blueprint's rule: a payments table is a payments table. What differs
 * between reception and the owner is which columns render, and that is a
 * column factory taking `can`, not a second component. Five parallel tables
 * is how a fix to one of them silently misses the other four.
 */

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Right-align and use tabular figures. For money and counts. */
  numeric?: boolean;
  /** Hide below `sm`. For columns that are context rather than the point. */
  secondary?: boolean;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  caption?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = "Nothing here yet.",
  caption,
}: Props<T>) {
  if (!rows.length) {
    return (
      <div className="rounded border border-rule bg-surface px-4 py-10 text-center text-sm text-ink-soft">
        {empty}
      </div>
    );
  }

  return (
    // The table scrolls inside its own box. A wide roster must not make the
    // whole page scroll sideways on a reception laptop.
    <div className="overflow-x-auto rounded border border-rule bg-surface">
      <table className="w-full min-w-max border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-rule">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint ${
                  column.numeric ? "text-right" : "text-left"
                } ${column.secondary ? "hidden sm:table-cell" : ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-rule last:border-b-0 hover:bg-sunk/60"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-3 py-2.5 align-middle ${
                    column.numeric ? "tabular text-right" : "text-left"
                  } ${column.secondary ? "hidden sm:table-cell" : ""}`}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
