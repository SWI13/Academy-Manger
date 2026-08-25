import type { ReactNode } from "react";

export type Detail = { label: string; value: ReactNode; wide?: boolean };

/**
 * Label/value pairs for a detail page.
 *
 * Rows with no value are dropped rather than rendered as a dash, so an
 * approved payment does not carry an empty "Rejected by" line and a reader
 * can tell at a glance which of the three outcomes actually happened.
 *
 * `wide` spans both columns, for prose - a description, a rejection reason, a
 * note - which reads badly in a half-width well beside a phone number.
 */
export function DescriptionList({
  items,
  columns = 2,
}: {
  items: (Detail | null | false)[];
  columns?: 1 | 2 | 3;
}) {
  const rows = items.filter((item): item is Detail => Boolean(item));
  if (!rows.length) return null;

  const grid =
    columns === 1
      ? ""
      : columns === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2";

  return (
    <dl className={`grid gap-x-8 gap-y-5 ${grid}`}>
      {rows.map((row) => (
        <div
          key={row.label}
          className={row.wide && columns !== 1 ? "sm:col-span-full" : undefined}
        >
          <dt className="eyebrow">{row.label}</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
