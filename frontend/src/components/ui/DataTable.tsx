"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { useDict } from "@/components/LocaleProvider";

import { EmptyState } from "./EmptyState";
import { Icon, type IconName } from "./Icon";

/**
 * One table, many column sets.
 *
 * The blueprint's rule: a payments table is a payments table. What differs
 * between reception and the owner is which columns render, and that is a
 * column factory taking `can`, not a second component. Five parallel tables
 * is how a fix to one of them silently misses the other four.
 *
 * Below `md` this stops being a table at all. A row becomes a card: the
 * leading column is the heading, the trailing column sits opposite it, and
 * everything else becomes label/value pairs underneath. Squeezing seven
 * columns onto a 375px screen and letting it scroll sideways is how a
 * receptionist ends up reading an amount against the wrong name.
 */

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Right-align and use tabular figures. For money and counts. */
  numeric?: boolean;
  /** Hidden below `lg`. For columns that are context rather than the point. */
  secondary?: boolean;
  /**
   * The card's heading on small screens. Exactly one column should carry it;
   * the first is used if none does.
   */
  lead?: boolean;
  /** Pinned opposite the heading on a card. For the status badge. */
  trail?: boolean;
  /** Fixed column width, e.g. "1%" to make a column shrink to its content. */
  width?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Makes the whole row clickable, keyboard included. The cell keeps its link. */
  rowHref?: (row: T) => string;
  empty?: ReactNode;
  emptyIcon?: IconName;
  emptyDescription?: ReactNode;
  caption?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
  emptyIcon = "layers",
  emptyDescription,
  caption,
}: Props<T>) {
  const d = useDict();
  const router = useRouter();

  if (!rows.length) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={empty ?? d.empty.nothing}
        description={emptyDescription}
      />
    );
  }

  const lead = columns.find((column) => column.lead) ?? columns[0];
  const trail = columns.find((column) => column.trail);
  const rest = columns.filter(
    (column) => column !== lead && column !== trail,
  );

  function open(row: T) {
    if (rowHref) router.push(rowHref(row));
  }

  return (
    <>
      {/* --- the table, from md up ------------------------------------ */}
      <div
        className="scroll-slim glass hidden overflow-x-auto rounded-xl border border-rule md:block"
      >
        <table className="w-full border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          {/*
            No sticky header. The table sits in a horizontal scroll container,
            and a box with `overflow-x: auto` is a scrollport on both axes -
            so a sticky `thead` inside it sticks to the top of a box that
            never scrolls vertically, which is to say it does nothing. Better
            no promise than one the layout cannot keep.
          */}
          <thead>
            <tr className="border-b border-rule bg-black/40">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={`eyebrow whitespace-nowrap px-4 py-2.5 ${
                    column.numeric ? "text-end" : "text-start"
                  } ${column.secondary ? "hidden lg:table-cell" : ""}`}
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
                onClick={rowHref ? () => open(row) : undefined}
                className={`border-b border-rule transition-colors last:border-b-0 last:[&>td]:pb-3.5 ${
                  rowHref
                    ? "cursor-pointer hover:bg-accent-soft"
                    : "hover:bg-white/[0.04]"
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-middle ${
                      column.numeric ? "tabular text-end" : "text-start"
                    } ${column.secondary ? "hidden lg:table-cell" : ""}`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- the same rows as cards, below md ------------------------- */}
      <ul className="flex flex-col gap-2.5 md:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const Row = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">{lead.cell(row)}</div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {trail ? trail.cell(row) : null}
                  {href ? (
                    <Icon name="chevron-right" size={16} className="text-ink-faint" />
                  ) : null}
                </div>
              </div>
              {rest.length ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-rule pt-3">
                  {rest.map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="eyebrow">{column.header}</dt>
                      <dd
                        className={`mt-0.5 truncate text-sm text-ink ${
                          column.numeric ? "tabular" : ""
                        }`}
                      >
                        {column.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </>
          );

          return (
            <li key={rowKey(row)}>
              {href ? (
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => open(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      open(row);
                    }
                  }}
                  className="glass block rounded-xl border border-rule p-4 transition-colors active:border-accent-line active:bg-accent-soft"
                >
                  {Row}
                </div>
              ) : (
                <div className="glass rounded-xl border border-rule p-4">
                  {Row}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
