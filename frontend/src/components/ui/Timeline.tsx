import type { ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

type Tone = "plain" | "ok" | "warn" | "bad" | "info" | "accent";

const NODES: Record<Tone, string> = {
  plain: "border-rule bg-surface text-ink-faint",
  ok: "border-ok-line bg-ok-wash text-ok",
  warn: "border-warn-line bg-warn-wash text-warn",
  bad: "border-bad-line bg-bad-wash text-bad",
  info: "border-info-line bg-info-wash text-info",
  accent: "border-accent-line bg-accent-soft text-accent",
};

export type TimelineEntry = {
  id: string;
  icon: IconName;
  tone?: Tone;
  title: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
  /** Rendered dimmer, for a step in the life of a record that has not happened. */
  future?: boolean;
};

/**
 * What happened to a record, in order.
 *
 * The rail is drawn behind the nodes rather than as a border on each entry,
 * so it runs continuously through variable-height rows and stops cleanly at
 * the last node instead of trailing off the bottom.
 *
 * Used for a payment's life and for the audit log, which are the same shape:
 * a sequence of things somebody did, each with a time and an actor.
 */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="relative flex flex-col gap-5">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-3.5">
          {index < entries.length - 1 ? (
            <span
              aria-hidden
              className="absolute left-[15px] top-8 h-[calc(100%+4px)] w-px bg-rule"
            />
          ) : null}

          <span
            aria-hidden
            className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border ${
              NODES[entry.tone ?? "plain"]
            } ${entry.future ? "opacity-50" : ""}`}
          >
            <Icon name={entry.icon} size={15} />
          </span>

          <div className={`min-w-0 flex-1 pt-1 ${entry.future ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-sm font-medium text-ink">{entry.title}</p>
              {entry.meta ? (
                <p className="tabular text-xs text-ink-faint">{entry.meta}</p>
              ) : null}
            </div>
            {entry.body ? (
              <div className="mt-1 text-sm text-ink-soft">{entry.body}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
