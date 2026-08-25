"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Filters that live in the URL.
 *
 * Deliberately not component state. A receptionist who has narrowed a ledger
 * to one student and one month needs to be able to send that view to someone
 * else, and to still have it after a refresh or a browser back. Filter state
 * kept in `useState` is state nobody can share.
 */

export type FilterSpec = {
  param: string;
  label: string;
  /** Absent means a free-text box. */
  options?: { value: string; label: string }[];
  placeholder?: string;
};

export function Toolbar({
  filters,
  children,
}: {
  filters: FilterSpec[];
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function apply(param: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    // Any filter change resets paging: page 3 of the old result set is not
    // page 3 of the new one.
    next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  const active = filters.some((filter) => params.get(filter.param));

  return (
    <div
      className="flex flex-wrap items-end gap-3"
      aria-busy={pending || undefined}
    >
      {filters.map((filter) => (
        <label key={filter.param} className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            {filter.label}
          </span>
          {filter.options ? (
            <select
              value={params.get(filter.param) ?? ""}
              onChange={(event) => apply(filter.param, event.target.value)}
              className="rounded border border-rule-strong bg-surface px-2 py-1.5 text-sm text-ink"
            >
              <option value="">Any</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={filter.param === "from" || filter.param === "to" ? "date" : "text"}
              defaultValue={params.get(filter.param) ?? ""}
              placeholder={filter.placeholder}
              onBlur={(event) => apply(filter.param, event.target.value.trim())}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  apply(filter.param, event.currentTarget.value.trim());
                }
              }}
              className="rounded border border-rule-strong bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint"
            />
          )}
        </label>
      ))}

      {active ? (
        <button
          type="button"
          onClick={() => startTransition(() => router.push(pathname))}
          className="rounded border border-transparent px-2 py-1.5 text-sm text-ink-soft hover:bg-sunk hover:text-ink"
        >
          Clear
        </button>
      ) : null}

      <div className="ml-auto flex items-end gap-2">{children}</div>
    </div>
  );
}
