"use client";

import { useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormError } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { api, type ApiFailure } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { AuditLog } from "@/types";

/**
 * The log, read forward from a cursor.
 *
 * Cursor pagination, not page numbers, because the table is append-only and
 * unbounded: rows arriving mid-pagination make page numbers skip entries, and
 * in a log a skipped entry is a missing record rather than a cosmetic glitch.
 * So "load more" rather than "page 3" - the shape of the control follows the
 * shape of the data.
 *
 * Drawn as one continuous stream with the day called out as it changes, and
 * the clock time down the left. An audit log is read by scanning for a moment
 * in time and then reading outward from it, which is what a timeline supports
 * and a table of rows does not.
 */
export function AuditFeed({
  initial,
  initialNext,
}: {
  initial: AuditLog[];
  initialNext: string | null;
}) {
  const [entries, setEntries] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      // The API hands back a full URL. Only its query string matters here -
      // the path is ours, and following an absolute URL from a payload is a
      // habit worth not forming.
      const cursor = new URL(next).searchParams.toString();
      const page = await api.get<{ results: AuditLog[]; next: string | null }>(
        `/audit?${cursor}`,
      );
      setEntries((current) => [...current, ...page.results]);
      setNext(page.next);
    } catch (failure) {
      setError((failure as ApiFailure).message ?? "Could not load more.");
    } finally {
      setBusy(false);
    }
  }

  if (!entries.length) {
    return (
      <EmptyState
        icon="shield"
        title="Nothing recorded for these filters"
        description="The log holds every consequential action. If this is empty, none of them match — not that none happened."
      />
    );
  }

  /*
   * The day heading is a property of each entry, worked out once from the one
   * before it. Computed here rather than tracked with a variable that the map
   * reassigns: a render that mutates something outside itself gives a
   * different answer the second time React runs it.
   */
  const rows = entries.map((entry, index) => ({
    entry,
    day: formatDate(entry.created_at),
    opensDay:
      index === 0 ||
      formatDate(entry.created_at) !== formatDate(entries[index - 1].created_at),
  }));

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col">
        {rows.map(({ entry, day, opensDay }) => (
          <li key={entry.id}>
            {opensDay ? (
              <p className="eyebrow sticky top-16 z-10 -mx-1 bg-paper/85 px-1 py-2 backdrop-blur">
                {day}
              </p>
            ) : null}
            <Entry entry={entry} />
          </li>
        ))}
      </ol>

      {error ? <FormError>{error}</FormError> : null}

      {next ? (
        <Button
          busy={busy}
          icon="chevron-down"
          onClick={loadMore}
          className="self-start"
        >
          Load more
        </Button>
      ) : (
        <p className="py-2 text-[13px] text-ink-faint">That is the whole trail.</p>
      )}
    </div>
  );
}

/** The glyph and tint for a kind of action, so the stream is scannable. */
function markFor(action: string): { icon: IconName; tone: string } {
  if (action.startsWith("PAYMENT_APPROVED")) {
    return { icon: "check", tone: "border-ok-line bg-ok-wash text-ok" };
  }
  if (
    action.startsWith("PAYMENT_REJECTED") ||
    action.startsWith("LOGIN_FAILED")
  ) {
    return { icon: "close", tone: "border-bad-line bg-bad-wash text-bad" };
  }
  if (action.startsWith("PAYMENT")) {
    return { icon: "wallet", tone: "border-warn-line bg-warn-wash text-warn" };
  }
  if (action.startsWith("ROLE") || action.startsWith("PASSWORD")) {
    return { icon: "key", tone: "border-warn-line bg-warn-wash text-warn" };
  }
  if (action.startsWith("USER")) {
    return { icon: "user", tone: "border-info-line bg-info-wash text-info" };
  }
  if (action.startsWith("MARK")) {
    return {
      icon: "check-circle",
      tone: "border-accent-line bg-accent-soft text-accent",
    };
  }
  if (action.startsWith("ENROLLMENT")) {
    return {
      icon: "graduation",
      tone: "border-accent-line bg-accent-soft text-accent",
    };
  }
  if (action.includes("DOWNLOAD") || action.includes("EXPORT")) {
    return { icon: "download", tone: "border-info-line bg-info-wash text-info" };
  }
  if (action.startsWith("REVIEW")) {
    return { icon: "star", tone: "border-rule bg-white/[0.06] text-ink-faint" };
  }
  return { icon: "activity", tone: "border-rule bg-white/[0.06] text-ink-faint" };
}

/** "14:32:18", the clock time in the reader's own zone. */
function clock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function Entry({ entry }: { entry: AuditLog }) {
  const changed = Object.keys({ ...entry.old_values, ...entry.new_values });
  const mark = markFor(entry.action);

  return (
    <article className="relative flex gap-3 py-1.5 pl-1">
      {/* The rail, behind the node, running the height of the entry. */}
      <span
        aria-hidden
        className="absolute bottom-0 left-[27px] top-0 w-px bg-rule"
      />

      <time
        dateTime={entry.created_at}
        className="tabular hidden w-[4.25rem] shrink-0 pt-3 text-right text-xs text-ink-faint sm:block"
      >
        {clock(entry.created_at)}
      </time>

      <span
        aria-hidden
        className={`relative z-10 mt-2.5 flex size-7 shrink-0 items-center justify-center rounded-full border ${mark.tone}`}
      >
        <Icon name={mark.icon} size={14} />
      </span>

      <div className="min-w-0 flex-1 glass rounded-xl border border-rule p-3.5">
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium text-ink">{entry.action_display}</p>
          <p className="tabular text-xs text-ink-faint sm:hidden">
            {clock(entry.created_at)}
          </p>
          {entry.object_label ? (
            <p className="tabular rounded-md bg-white/[0.06] px-1.5 py-0.5 text-xs text-ink-soft">
              {entry.object_label}
            </p>
          ) : null}
        </header>

        <p className="mt-2 flex items-center gap-2 text-[13px] text-ink-soft">
          {/*
            The actor's name as it was at the time, not a join to who they are
            now. That is what an audit needs - and why this table holds no
            foreign keys at all.
          */}
          {entry.actor_name ? (
            <Avatar
              name={entry.actor_name}
              seed={entry.actor_public_id ?? entry.actor_name}
              size="xs"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-6 items-center justify-center rounded-full bg-sunk text-ink-faint"
            >
              <Icon name="settings" size={12} />
            </span>
          )}
          <span className="min-w-0 truncate">
            {entry.actor_name || "system"}
            {entry.actor_public_id ? (
              <span className="tabular text-ink-faint">
                {" "}
                {entry.actor_public_id}
              </span>
            ) : null}
          </span>
        </p>

        {changed.length ? (
          <dl className="mt-3 flex flex-col gap-1.5 border-t border-rule pt-3">
            {changed.map((field) => {
              const before = entry.old_values[field];
              const after = entry.new_values[field];
              const had = field in entry.old_values;

              return (
                <div
                  key={field}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
                >
                  <dt className="eyebrow min-w-24">{field.replace(/_/g, " ")}</dt>
                  <dd className="tabular flex flex-wrap items-baseline gap-1.5">
                    {had ? (
                      <>
                        <span className="rounded bg-bad-wash px-1.5 py-0.5 text-bad line-through decoration-bad/40">
                          {String(before ?? "—")}
                        </span>
                        <Icon
                          name="arrow-right"
                          size={11}
                          className="text-ink-faint"
                        />
                      </>
                    ) : null}
                    <span className="rounded bg-ok-wash px-1.5 py-0.5 text-ok">
                      {String(after ?? "—")}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : null}

        {entry.ip_address ? (
          <p className="tabular mt-2.5 flex items-center gap-1.5 text-xs text-ink-faint">
            <Icon name="pin" size={12} />
            {entry.ip_address}
          </p>
        ) : null}
      </div>
    </article>
  );
}
