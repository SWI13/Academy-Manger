/**
 * The vocabulary every printed document in this platform is described in.
 *
 * One shape, used by fifteen reports. A print route says what its columns are,
 * what its rows are and what the totals under them mean; `PrintDocument`
 * decides everything else - the masthead, the page breaks, the repeated
 * column headers, the page numbers, the footer.
 *
 * That division is the whole point of the system. A second report that laid
 * out its own header would drift from the first one within a month, and an
 * institute would end up with two kinds of official paper.
 */

import type { ReactNode } from "react";

/** A4, less the margins `@page` sets. In millimetres, because paper is. */
export const PAGE = {
  portrait: { width: 182, height: 269 },
  landscape: { width: 269, height: 182 },
} as const;

export type Orientation = keyof typeof PAGE;

/**
 * One column of a printed table.
 *
 * `cell` returns a node rather than a string so a report can emboldon a
 * figure or stack an identifier under a name - but nothing here is
 * interactive, because paper is not.
 */
export type PrintColumn<T> = {
  key: string;
  header: string;
  cell: (row: T, index: number) => ReactNode;
  /** Right-align and use tabular figures. For money and counts. */
  numeric?: boolean;
  /** A percentage, e.g. "18%". Left alone, columns share the width evenly. */
  width?: string;
};

/** A named figure under a table, or in the header's filter line. */
export type PrintFact = { label: string; value: ReactNode };

/**
 * What narrowed this document, in words.
 *
 * Printed under the title, because a sheet headed "STUDENT LIST" that is
 * actually one class is a sheet somebody will file as the whole school.
 * Resolved to names by the route - never printed as `class=7`.
 */
export type PrintFilter = { label: string; value: string };

/**
 * A code, in the reader's language.
 *
 * Every print route turns statuses, roles and conditions into words, and every
 * one of them has to cope with three things: a field the schema types as
 * optional, a code the dictionary has not been taught yet, and a value that is
 * simply absent. One helper rather than fifteen inline casts.
 *
 * An unknown code prints as itself rather than as a blank - visibly English in
 * a French document is exactly the signal that a word is missing.
 */
export function label(
  table: Record<string, string | undefined>,
  code: string | null | undefined,
  fallback = "—",
): string {
  if (!code) return fallback;
  return table[code] ?? code;
}

/**
 * Turn a page's search params into the filter line, resolving ids to names.
 *
 * `resolve` is given the raw value and returns what to print, so a route can
 * look "7" up in a list of courses it already fetched. Returning null drops
 * the filter from the line entirely.
 */
export function describeFilters<P extends Record<string, string | string[] | undefined>>(
  params: P,
  specs: {
    param: string;
    label: string;
    resolve?: (value: string) => string | null;
  }[],
): PrintFilter[] {
  const out: PrintFilter[] = [];
  for (const spec of specs) {
    const raw = params[spec.param];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!value) continue;
    const resolved = spec.resolve ? spec.resolve(value) : value;
    if (resolved) out.push({ label: spec.label, value: resolved });
  }
  return out;
}

/**
 * Forward the caller's own filters to a print endpoint.
 *
 * The one function that makes "print what I am looking at" true rather than
 * aspirational: the sheet runs the same query the screen ran, because it is
 * handed the same query string.
 */
export function printQuery(
  params: Record<string, string | string[] | undefined>,
  allowed: readonly string[],
): string {
  const query = new URLSearchParams();
  for (const key of allowed) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) query.set(key, value);
  }
  return query.toString();
}

/**
 * Where a print sheet for the current screen lives.
 *
 * Used by every `PrintButton` in the dashboard. The filters ride in the URL
 * because that is already where the toolbar keeps them.
 */
export function printHref(
  base: string,
  params: Record<string, string | string[] | undefined>,
  allowed: readonly string[],
): string {
  const query = printQuery(params, allowed);
  return query ? `${base}?${query}` : base;
}

/**
 * Deal measured rows into pages.
 *
 * Pure geometry, and it lives here rather than in the component so it can be
 * reasoned about - and checked - without a browser. `PrintDocument` supplies
 * the measurements; this decides where the breaks fall.
 *
 * The first page is shorter than the rest because the masthead sits on it,
 * and the last page has to leave room for the totals. Both are accounted for
 * here rather than hoped for, which is the difference between a totals line
 * at the foot of page three and a totals line alone on page four.
 */
export function distribute(
  heights: number[],
  space: { pageHeight: number; masthead: number; footer: number; totals: number; header: number },
): number[][] {
  const pages: number[][] = [];
  let current: number[] = [];
  let used = 0;

  const roomOn = (pageIndex: number) =>
    space.pageHeight -
    space.footer -
    space.header -
    (pageIndex === 0 ? space.masthead : 0);

  for (let index = 0; index < heights.length; index += 1) {
    const height = heights[index];
    const available = roomOn(pages.length);

    // A row never straddles a break - it moves whole to the next page.
    if (current.length && used + height > available) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(index);
    used += height;
  }

  if (current.length) pages.push(current);
  if (!pages.length) pages.push([]);

  // The totals need room under the last page's final row. If they do not fit,
  // they get a page of their own rather than being cut in half.
  const lastIndex = pages.length - 1;
  const lastHeight = pages[lastIndex].reduce((sum, index) => sum + heights[index], 0);
  if (space.totals && lastHeight + space.totals > roomOn(lastIndex)) {
    pages.push([]);
  }

  return pages;
}
