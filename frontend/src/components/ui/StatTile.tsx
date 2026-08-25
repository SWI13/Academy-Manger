import Link from "next/link";
import type { ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

type Tone = "plain" | "ok" | "warn" | "bad" | "accent";

const VALUE_TONES: Record<Tone, string> = {
  plain: "text-ink",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  accent: "text-accent",
};

const MARK_TONES: Record<Tone, string> = {
  plain: "border-rule bg-sunk text-ink-faint",
  ok: "border-ok-line bg-ok-wash text-ok",
  warn: "border-warn-line bg-warn-wash text-warn",
  bad: "border-bad-line bg-bad-wash text-bad",
  accent: "border-accent-line bg-accent-soft text-accent",
};

/**
 * One number, named.
 *
 * A tile renders only if the dashboard endpoint sent its number. Nothing here
 * decides whether the caller may see a figure - the API simply does not
 * include one they may not, so there is no hidden value in the DOM to find in
 * a network tab.
 *
 * The figure is the largest thing in the box and the label is the smallest,
 * because the question a dashboard answers is "how many" and the label is
 * only there to say of what. `href` turns the tile into the way into the list
 * it counts, which is the difference between a number and an answer.
 */
export function StatTile({
  label,
  value,
  note,
  tone = "plain",
  icon,
  href,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: Tone;
  icon?: IconName;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{label}</p>
        {icon ? (
          <span
            aria-hidden
            className={`flex size-7 items-center justify-center rounded-lg border ${MARK_TONES[tone]}`}
          >
            <Icon name={icon} size={15} />
          </span>
        ) : null}
      </div>
      <p
        className={`tabular mt-2.5 text-[26px] font-semibold leading-none tracking-tight ${VALUE_TONES[tone]}`}
      >
        {value}
      </p>
      {note ? (
        <p className="mt-2 text-[13px] leading-snug text-ink-soft">{note}</p>
      ) : null}
    </>
  );

  const shell =
    "flex flex-col rounded-xl border border-rule bg-surface p-4 shadow-xs transition-[box-shadow,border-color]";

  if (href) {
    return (
      <Link
        href={href}
        className={`${shell} group hover:border-rule-strong hover:shadow-sm`}
      >
        {body}
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          Open
          <Icon name="arrow-right" size={13} />
        </span>
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}

/**
 * A figure inside a card rather than a tile of its own.
 *
 * Used where four numbers describe one thing - a balance, a report's totals -
 * and boxing each of them separately would break the group apart.
 */
export function Figure({
  label,
  value,
  tone = "plain",
  note,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  note?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p
        className={`tabular mt-1.5 text-xl font-semibold tracking-tight ${VALUE_TONES[tone]}`}
      >
        {value}
      </p>
      {note ? <p className="mt-1 text-xs text-ink-faint">{note}</p> : null}
    </div>
  );
}
