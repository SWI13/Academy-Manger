"use client";

import { createContext, useContext } from "react";

import type { Dict } from "@/lib/dict/en";
import { LOCALE_INFO, fill, type Locale } from "@/lib/i18n";

/**
 * The active language, handed down from the server.
 *
 * The root layout has already read the cookie and chosen a dictionary; this
 * carries that one dictionary into the client components that need it. Server
 * components do not use it - they call `getDict()` and render their strings
 * into the HTML, so most of the application's copy never crosses this
 * boundary at all.
 *
 * The whole active dictionary is passed rather than the slices each component
 * needs. It is one object of a few dozen kilobytes in the payload, sent once
 * for the page, and the alternative is every client component declaring which
 * strings it wants and a prop drilled through four layers to deliver them.
 *
 * It is not a cache and there is no client-side switching: choosing a
 * language writes a cookie and asks the server to render again, so what
 * arrives is always what the server decided.
 */

type LocaleValue = {
  locale: Locale;
  dict: Dict;
  dir: "ltr" | "rtl";
  /** The tag for Intl - "fr-DZ", not "fr". */
  intl: string;
};

const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dict;
  children: React.ReactNode;
}) {
  const info = LOCALE_INFO[locale];
  return (
    <LocaleContext.Provider
      value={{ locale, dict, dir: info.dir, intl: info.intl }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

function useLocaleValue(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useDict must be used inside LocaleProvider.");
  }
  return value;
}

/** The active dictionary. The one hook nearly every client component wants. */
export function useDict(): Dict {
  return useLocaleValue().dict;
}

/** The active locale, its direction and its Intl tag. */
export function useLocale(): Omit<LocaleValue, "dict"> {
  const { locale, dir, intl } = useLocaleValue();
  return { locale, dir, intl };
}

/**
 * A string with its `{placeholders}` filled.
 *
 * `t(d.shell.notificationsWithCount, { count })` rather than a template
 * literal, so the sentence keeps its word order in every language - Arabic
 * does not put the number where French does.
 */
export function useFill(): (
  template: string,
  values: Record<string, string | number>,
) => string {
  return fill;
}
