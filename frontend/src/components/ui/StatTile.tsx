import type { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "plain" | "ok" | "warn" | "bad";
};

const TONES = {
  plain: "text-ink",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
} as const;

/**
 * One number, named.
 *
 * A tile renders only if the dashboard endpoint sent its number. Nothing here
 * decides whether the caller may see a figure - the API simply does not
 * include one they may not, so there is no hidden value in the DOM to find in
 * a network tab.
 */
export function StatTile({ label, value, note, tone = "plain" }: Props) {
  return (
    <div className="rounded border border-rule bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p className={`tabular mt-2 text-2xl font-semibold ${TONES[tone]}`}>
        {value}
      </p>
      {note ? <p className="mt-1 text-sm text-ink-soft">{note}</p> : null}
    </div>
  );
}
