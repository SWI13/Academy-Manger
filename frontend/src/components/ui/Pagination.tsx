"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { formatNumber } from "@/lib/format";

/**
 * Page N of a DRF-paginated list.
 *
 * The count comes from the API rather than from the rows on screen, because
 * the rows on screen are one page of a scoped queryset and adding them up
 * would report a different total to every role.
 */
export function Pagination({
  count,
  page,
  pageSize,
}: {
  count: number;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) {
    return (
      <p className="text-sm text-ink-faint">
        {formatNumber(count)} {count === 1 ? "record" : "records"}
      </p>
    );
  }

  function go(target: number) {
    const next = new URLSearchParams(params.toString());
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));
    router.push(`${pathname}?${next.toString()}`);
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, count);

  return (
    <nav
      aria-label="Pages"
      className="flex items-center justify-between gap-4 text-sm"
    >
      <p className="tabular text-ink-faint">
        {formatNumber(first)}–{formatNumber(last)} of {formatNumber(count)}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          className="rounded border border-rule-strong px-2 py-1 text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span className="tabular text-ink-soft">
          {page} / {pages}
        </span>
        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page >= pages}
          className="rounded border border-rule-strong px-2 py-1 text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
