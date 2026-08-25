import type { ReactNode } from "react";

export type Detail = { label: string; value: ReactNode };

/**
 * Label/value pairs for a detail page.
 *
 * Rows with no value are dropped rather than rendered as a dash, so an
 * approved payment does not carry an empty "Rejected by" line and a reader
 * can tell at a glance which of the three outcomes actually happened.
 */
export function DescriptionList({ items }: { items: (Detail | null)[] }) {
  const rows = items.filter((item): item is Detail => item !== null);

  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            {row.label}
          </dt>
          <dd className="mt-0.5 text-sm text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
