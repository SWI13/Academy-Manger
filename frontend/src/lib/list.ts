import "server-only";

import { getJson } from "./django";
import { cookieHeader } from "./session";

/** DRF's PageNumberPagination page size, from apps/core/pagination.py. */
export const PAGE_SIZE = 25;

export type Page<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Turn a page's search params into a Django query string.
 *
 * Only the keys a page names are forwarded. Passing everything through would
 * let a caller append any query parameter they liked to an internal request,
 * and a filter the backend happens to support but the screen never intended
 * is exactly the kind of thing nobody notices until it matters.
 */
export function queryFrom(params: SearchParams, allowed: string[]): string {
  const query = new URLSearchParams();
  for (const key of allowed) {
    const value = params[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) query.set(key, single);
  }
  return query.toString();
}

export function pageFrom(params: SearchParams): number {
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

/** Fetch one page of a list resource as the signed-in caller. */
export async function fetchPage<T>(
  resource: string,
  params: SearchParams,
  allowed: string[],
): Promise<Page<T> | null> {
  const query = queryFrom(params, [...allowed, "page"]);
  const suffix = query ? `?${query}` : "";
  return getJson<Page<T>>(
    `/api/v1/${resource}/${suffix}`,
    await cookieHeader(),
  );
}
