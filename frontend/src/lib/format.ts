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
