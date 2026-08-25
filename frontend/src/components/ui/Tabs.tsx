"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Icon, type IconName } from "./Icon";

export type Tab = {
  key: string;
  label: string;
  icon?: IconName;
  /** A number beside the label - a queue length, a row count. */
  count?: number;
};

/**
 * Tabs that are links, not state.
 *
 * Which report is open and which section of a course is being read are both
 * things worth being able to send to somebody, so the tab lives in the query
 * string and each tab is an anchor. That also means the browser's back button
 * does what a reader expects, which client-side tab state never does.
 */
export function Tabs({
  tabs,
  param = "tab",
  active,
  className = "",
}: {
  tabs: Tab[];
  /** The query parameter that holds the selection. */
  param?: string;
  /** The current key. Resolved by the caller, which knows its own default. */
  active: string;
  className?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  function href(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set(param, key);
    // A tab is a different view of the same collection, so page 3 of the old
    // one means nothing here.
    next.delete("page");
    return `${pathname}?${next.toString()}`;
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`scroll-slim -mx-1 flex gap-1 overflow-x-auto border-b border-rule px-1 ${className}`}
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={href(tab.key)}
            role="tab"
            aria-selected={selected}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              selected
                ? "border-accent text-accent"
                : "border-transparent text-ink-soft hover:border-rule-strong hover:text-ink"
            }`}
          >
            {tab.icon ? <Icon name={tab.icon} size={15} /> : null}
            {tab.label}
            {tab.count !== undefined ? (
              <span
                className={`tabular rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                  selected ? "bg-accent-soft text-accent" : "bg-sunk text-ink-faint"
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
