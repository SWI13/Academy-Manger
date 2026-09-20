/**
 * Formatting at the edge.
 *
 * Money arrives as integer minor units plus a currency code and is turned
 * into text here and nowhere else. There is no arithmetic on money in this
 * codebase: totals, balances and remaining amounts are computed by Django and
 * rendered as received.
 *
 * That rule is not fussiness. A browser that adds up payments will eventually
 * disagree with the backend - a filtered page, a rounding difference, a
 * pending row counted once too often - and the receptionist will believe the
 * screen in front of them rather than the ledger.
 */

const MINOR_UNITS: Record<string, number> = {
  DZD: 2,
  EUR: 2,
  USD: 2,
};

export function formatMoney(
  minor: number | null | undefined,
  currency = "DZD",
  locale = "fr-DZ",
): string {
  if (minor === null || minor === undefined) return "—";
  const exponent = MINOR_UNITS[currency] ?? 2;
  const major = minor / 10 ** exponent;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(major);
  } catch {
    // An unknown currency code must still render a number rather than throw
    // in the middle of a table.
    return `${major.toFixed(exponent)} ${currency}`;
  }
}

/**
 * The days of the week, in the reader's language.
 *
 * Indexed the way Django's `weekday()` counts them - Monday is 0 - because
 * that is what the schedule rows carry. 5 January 1970 was a Monday, which
 * makes the arithmetic below a lookup rather than a table.
 */
export function weekdayName(
  index: number,
  locale = "fr-DZ",
  style: "long" | "short" = "long",
): string {
  const monday = Date.UTC(1970, 0, 5);
  const day = new Date(monday + index * 86400000);
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: style,
      timeZone: "UTC",
    }).format(day);
  } catch {
    return String(index);
  }
}

export function formatDate(
  value: string | null | undefined,
  locale = "fr-DZ",
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(
  value: string | null | undefined,
  locale = "fr-DZ",
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("fr-DZ").format(value);
}

/**
 * A typed amount, turned into the integer minor units the API takes.
 *
 * By string, never by `value * 100`. Binary floating point cannot hold 0.1,
 * so `20000.10 * 100` is 2000009.9999999998 and the payment recorded is a
 * centime short of the one that was handed over. Splitting on the separator
 * and padding the fraction is exact for every amount a person can type.
 *
 * This is not arithmetic on money in the sense the architecture forbids -
 * nothing here adds two amounts together or derives a balance. It converts
 * one number a person typed into the unit the contract uses, at the edge,
 * which is the same job `formatMoney` does in the other direction.
 *
 * Returns null when the text is not an amount, so the caller can say so
 * rather than posting NaN.
 */
export function toMinorUnits(
  input: string,
  currency = "DZD",
): number | null {
  const text = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d*)?$/.test(text)) return null;

  const exponent = MINOR_UNITS[currency] ?? 2;
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > exponent) return null;

  const padded = fraction.padEnd(exponent, "0");
  const minor = Number(`${whole}${padded}`);
  return Number.isSafeInteger(minor) ? minor : null;
}
