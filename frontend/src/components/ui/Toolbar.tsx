"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Icon } from "./Icon";
import { useDict } from "@/components/LocaleProvider";

/**
 * Filters that live in the URL.
 *
 * Deliberately not component state. A receptionist who has narrowed a ledger
 * to one student and one month needs to be able to send that view to someone
 * else, and to still have it after a refresh or a browser back. Filter state
 * kept in `useState` is state nobody can share.
 *
 * On a phone the controls collapse behind a button that carries the count of
 * what is active, because five filter boxes above a list is five boxes
 * between the reader and the list.
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
  const d = useDict();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const activeCount = filters.filter((filter) => params.get(filter.param)).length;

  function apply(param: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    // Any filter change resets paging: page 3 of the old result set is not
    // page 3 of the new one.
    next.delete("page");
    const query = next.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  const controls = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      {filters.map((filter) => (
        <label key={filter.param} className="flex min-w-0 flex-col gap-1.5">
          <span className="eyebrow">{filter.label}</span>
          {filter.options ? (
            <div className="relative flex items-center">
              <select
                value={params.get(filter.param) ?? ""}
                onChange={(event) => apply(filter.param, event.target.value)}
                className="h-9 w-full appearance-none rounded-md border border-rule-strong bg-surface ps-3 pe-9 text-sm text-ink shadow-xs transition-colors hover:border-ink-faint focus:border-accent sm:w-auto sm:min-w-36"
              >
                <option value="">Any</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Icon
                name="chevron-down"
                size={15}
                className="pointer-events-none absolute end-3 text-ink-faint"
              />
            </div>
          ) : (
            <div className="relative flex items-center">
              {filter.param === "from" || filter.param === "to" ? null : (
                <Icon
                  name="search"
                  size={15}
                  className="pointer-events-none absolute start-3 text-ink-faint"
                />
              )}
              <input
                type={
                  filter.param === "from" || filter.param === "to"
                    ? "date"
                    : "search"
                }
                defaultValue={params.get(filter.param) ?? ""}
                placeholder={filter.placeholder}
                aria-label={filter.label}
                onBlur={(event) => apply(filter.param, event.target.value.trim())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    apply(filter.param, event.currentTarget.value.trim());
                  }
                }}
                className={`h-9 w-full rounded-md border border-rule-strong bg-surface pe-3 text-sm text-ink shadow-xs transition-colors placeholder:text-ink-faint hover:border-ink-faint focus:border-accent sm:w-52 ${
                  filter.param === "from" || filter.param === "to"
                    ? "ps-3"
                    : "ps-9"
                }`}
              />
            </div>
          )}
        </label>
      ))}

      {activeCount ? (
        <button
          type="button"
          onClick={() => startTransition(() => router.push(pathname))}
          className="inline-flex h-9 items-center gap-1.5 self-start rounded-md px-2.5 text-sm text-ink-soft transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <Icon name="close" size={14} />{d.common.clear}</button>
      ) : null}
    </div>
  );

  return (
    <div
      className="flex flex-col gap-3"
      aria-busy={pending || undefined}
      data-pending={pending || undefined}
    >
      <div className="flex items-center justify-between gap-3">
        {/* The toggle, on small screens only. */}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-rule-strong bg-surface px-3 text-sm font-medium text-ink shadow-xs transition-colors hover:bg-white/[0.06] sm:hidden"
        >
          <Icon name="filter" size={15} />
          Filters
          {activeCount ? (
            <span className="tabular inline-flex size-5 items-center justify-center rounded-full bg-accent-fill text-[11px] font-semibold text-accent-ink">
              {activeCount}
            </span>
          ) : null}
          <Icon
            name="chevron-down"
            size={14}
            className={`text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        <div className="hidden flex-1 sm:block">{controls}</div>

        {children ? (
          <div className="flex shrink-0 items-center gap-2">{children}</div>
        ) : null}
      </div>

      {open ? (
        <div className="animate-rise sm:hidden">{controls}</div>
      ) : null}

      {pending ? (
        <span className="sr-only" role="status">{d.ui.updatingList}</span>
      ) : null}
    </div>
  );
}
