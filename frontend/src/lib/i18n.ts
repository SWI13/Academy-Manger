import { ar } from "./dict/ar";
import { en } from "./dict/en";
import { fr } from "./dict/fr";
import type { Dict } from "./dict/en";

/**
 * Three languages, one of which reads right to left.
 *
 * This module is shared by both halves of the application, so it must stay
 * free of `next/headers` - a client component importing `LOCALE_INFO` would
 * otherwise drag a server-only API in behind it and fail to build. Anything
 * that reads a request lives in `i18n.server.ts`.
 *
 * Algeria: Arabic and French are the two languages the academy actually works
 * in, and English is here because the platform was written in it and somebody
 * will always want the original wording.
 *
 * ---------------------------------------------------------------------------
 * What is translated, and what is not
 * ---------------------------------------------------------------------------
 * Everything the *interface* says. Not the data: a course called "English B2"
 * is called that in all three languages because that is its name, and a
 * person's name is their name. Wilaya names come from the generated choice
 * list and stay as issued.
 *
 * Django's own validation messages arrive in English. Translating them here
 * would mean the browser deciding what a backend refusal means, which is the
 * one thing this codebase does not do - so a rejected form still shows the
 * server's sentence. Fixing that properly is a backend job.
 */

export const LOCALES = ["en", "fr", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

export const LOCALE_COOKIE = "sm_locale";

type LocaleInfo = {
  /** The language's name in itself. Never "Arabic" in a French menu. */
  label: string;
  /** Two letters, for the switcher's collapsed state. */
  short: string;
  dir: "ltr" | "rtl";
  /**
   * The tag handed to Intl. Regional rather than bare, because `ar` gives
   * "أغسطس" and Algeria says "أوت"; and because `ar-DZ` formats its numbers
   * with Latin digits, which is what an Algerian ledger uses.
   */
  intl: string;
};

export const LOCALE_INFO: Record<Locale, LocaleInfo> = {
  en: { label: "English", short: "EN", dir: "ltr", intl: "en-GB" },
  fr: { label: "Français", short: "FR", dir: "ltr", intl: "fr-DZ" },
  ar: { label: "العربية", short: "ع", dir: "rtl", intl: "ar-DZ" },
};

const DICTS: Record<Locale, Dict> = { en, fr, ar };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dictFor(locale: Locale): Dict {
  return DICTS[locale];
}

/**
 * Substitute `{name}` placeholders.
 *
 * The dictionaries hold plain strings rather than functions so the whole of
 * the active one can cross into a client component as a prop - a function is
 * not serialisable, and one that was would have to be duplicated in three
 * files three times over.
 */
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/**
 * A list, joined the way the language joins lists.
 *
 * "a, b and c" / "a, b et c" / "a وb وc". Intl knows all three; hard-coding
 * " and " would leave the Arabic reading as English with Arabic words in it.
 */
export function joinList(items: string[], locale: Locale): string {
  try {
    return new Intl.ListFormat(LOCALE_INFO[locale].intl, {
      style: "long",
      type: "conjunction",
    }).format(items);
  } catch {
    return items.join(", ");
  }
}

export type { Dict };
