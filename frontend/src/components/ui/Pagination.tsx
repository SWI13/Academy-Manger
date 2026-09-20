"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { useDict } from "@/components/LocaleProvider";
import { formatNumber } from "@/lib/format";

import { Button } from "./Button";

/**
 * Page N of a DRF-paginated list.
 *
 * The count comes from the API rather than from the rows on screen, because
 * the rows on screen are one page of a scoped queryset and adding them up
 * would report a different total to every role.
 *
 * A single page still says how many records there are. "1-25 of 25" and "25
 * records" answer the same question, and a list that shows nothing at all
 * about its size makes people wonder whether something is missing.
 */
export function Pagination({
  count,
  page,
  pageSize,
  unit,
}: {
  count: number;
  page: number;
  pageSize: number;
  /**
   * The noun after the count, already in the reader's language.
   *
   * Passed in rather than derived: this used to append an "s" for the plural,
   * which is wrong in French as often as it is right and meaningless in
   * Arabic, where the noun after a number over ten is singular anyway.
   */
  unit: string;
}) {
  const d = useDict();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const pages = Math.max(1, Math.ceil(count / pageSize));

  if (pages <= 1) {
    return (
      <p className="tabular text-[13px] text-ink-faint">
        {formatNumber(count)} {unit}
      </p>
    );
  }

  function go(target: number) {
    const next = new URLSearchParams(params.toString());
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));
    const query = next.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, count);

  return (
    <nav
      aria-label={d.ui.pages}
      aria-busy={pending || undefined}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="tabular text-[13px] text-ink-faint">
        <span className="font-medium text-ink-soft">
          {formatNumber(first)}–{formatNumber(last)}
        </span>{" "}
        {d.common.of} {formatNumber(count)} {unit}
      </p>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          icon="chevron-left"
          onClick={() => go(page - 1)}
          disabled={page <= 1 || pending}
        >
          {d.common.previous}
        </Button>
        <span className="tabular px-1 text-[13px] text-ink-soft">
          {page} <span className="text-ink-faint">/ {pages}</span>
        </span>
        <Button
          size="sm"
          trailing="chevron-right"
          onClick={() => go(page + 1)}
          disabled={page >= pages || pending}
        >
          {d.common.next}
        </Button>
      </div>
    </nav>
  );
}
