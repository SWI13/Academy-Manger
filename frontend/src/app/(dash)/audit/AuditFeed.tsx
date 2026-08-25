"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { api, type ApiFailure } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { AuditLog } from "@/types";

/**
 * The log, read forward from a cursor.
 *
 * Cursor pagination, not page numbers, because the table is append-only and
 * unbounded: rows arriving mid-pagination make page numbers skip entries, and
 * in a log a skipped entry is a missing record rather than a cosmetic glitch.
 * So "load more" rather than "page 3" - the shape of the control follows the
 * shape of the data.
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

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Entry entry={entry} />
          </li>
        ))}
      </ol>

      {!entries.length ? (
        <p className="rounded border border-rule bg-surface px-4 py-10 text-center text-sm text-ink-soft">
          Nothing recorded for these filters.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}

      {next ? (
        <Button busy={busy} onClick={loadMore} className="self-start">
          Load more
        </Button>
      ) : entries.length ? (
        <p className="text-sm text-ink-faint">That is the whole trail.</p>
      ) : null}
    </div>
  );
}

function Entry({ entry }: { entry: AuditLog }) {
  const changed = Object.keys({ ...entry.old_values, ...entry.new_values });

  return (
    <article className="rounded border border-rule bg-surface p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">{entry.action_display}</p>
        <p className="tabular text-xs text-ink-faint">
          {formatDateTime(entry.created_at)}
        </p>
      </header>

      <p className="mt-1 text-sm text-ink-soft">
        {/*
          The actor's name as it was at the time, not a join to who they are
          now. That is what an audit needs - and why this table holds no
          foreign keys at all.
        */}
        {entry.actor_name || "system"}{" "}
        {entry.actor_public_id ? (
          <span className="tabular text-ink-faint">{entry.actor_public_id}</span>
        ) : null}
        {entry.object_label ? (
          <>
            {" · "}
            {entry.object_label}
          </>
        ) : null}
      </p>

      {changed.length ? (
        <dl className="mt-2 grid gap-x-4 gap-y-1 border-t border-rule pt-2 text-xs sm:grid-cols-2">
          {changed.map((field) => (
            <div key={field} className="flex flex-wrap gap-1">
              <dt className="font-medium text-ink-faint">{field}</dt>
              <dd className="text-ink-soft">
                {field in entry.old_values ? (
                  <>
                    <span className="text-bad line-through">
                      {String(entry.old_values[field] ?? "—")}
                    </span>{" "}
                    →{" "}
                  </>
                ) : null}
                <span className="text-ink">
                  {String(entry.new_values[field] ?? "—")}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {entry.ip_address ? (
        <p className="tabular mt-2 text-xs text-ink-faint">
          from {entry.ip_address}
        </p>
      ) : null}
    </article>
  );
}
