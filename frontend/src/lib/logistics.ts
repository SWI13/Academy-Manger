/**
 * The small pieces of logistics logic the screens share.
 *
 * Nothing here adds up money or counts rows. Every total on a logistics
 * screen comes from `apps/logistics/services.py`, for the same reason no
 * balance is computed in the browser: a figure derived from the twenty-five
 * rows on screen will eventually disagree with the one in the database, and
 * the person at the desk believes the screen.
 *
 * What is here is naming and addressing - which month a URL means, what to
 * call it in the reader's language, and where the print sheet for the current
 * view lives.
 */

/** The filters the inventory list and its printed sheet both understand. */
export const ITEM_FILTERS = [
  "q",
  "category",
  "condition",
  "status",
  "location",
  "ordering",
] as const;

/** The filters the expense list and its printed report both understand. */
export const EXPENSE_FILTERS = [
  "q",
  "year",
  "month",
  "category",
  "method",
  "ordering",
] as const;

export type Period = { year: number; month: number };

/**
 * The month a page is showing.
 *
 * Absent or unreadable means this month, which is what somebody opening
 * "Expenses" with no further instruction is asking for. A month is validated
 * rather than clamped: `?month=13` is a mistake, and answering it with
 * December would be answering a question nobody asked.
 */
export function periodFrom(
  params: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): Period {
  const read = (key: string) => {
    const raw = Array.isArray(params[key]) ? params[key][0] : params[key];
    const value = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(value) ? value : null;
  };

  const year = read("year");
  const month = read("month");

  return {
    year: year !== null && year >= 2000 && year <= 2100 ? year : now.getFullYear(),
    month: month !== null && month >= 1 && month <= 12 ? month : now.getMonth() + 1,
  };
}

/**
 * The month's name, in the reader's language.
 *
 * Built from a real date rather than a table of twelve strings per
 * dictionary, so Algerian Arabic says "أوت" rather than "أغسطس" - which is
 * what `ar-DZ` gives and what an Algerian office writes. Day 15 avoids the
 * timezone edge where the first of the month becomes the last of the one
 * before it.
 */
export function monthName(
  month: number,
  locale = "fr-DZ",
  style: "long" | "short" = "long",
): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" }).format(
      new Date(Date.UTC(2000, month - 1, 15)),
    );
  } catch {
    return String(month);
  }
}

/** "March 2026", in the reader's language and word order. */
export function periodLabel(period: Period, locale = "fr-DZ"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(period.year, period.month - 1, 15)));
  } catch {
    return `${monthName(period.month, locale)} ${period.year}`;
  }
}

/**
 * Whether a filter is narrowing the list.
 *
 * (The address of a print sheet used to live here too. It is now
 * `printHref` in `lib/print`, shared by every printable screen.)
 *
 * The printed sheet says so in its subtitle. A page of paper headed
 * "LOGISTICS INVENTORY" that is actually one room's chairs is a document
 * somebody will file as the whole inventory.
 */
export function activeFilterCount(
  params: Record<string, string | string[] | undefined>,
  allowed: readonly string[],
): number {
  return allowed.filter((key) => {
    if (key === "ordering") return false;
    const value = Array.isArray(params[key]) ? params[key][0] : params[key];
    return Boolean(value);
  }).length;
}
