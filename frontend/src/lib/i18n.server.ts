import { cookies, headers } from "next/headers";

import { dictFor, isLocale, DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "./i18n";
import type { Dict } from "./dict/en";

/**
 * Reading the language off the request.
 *
 * Server-only, because it touches `cookies()` and `headers()`. Kept apart
 * from `i18n.ts` so that a client component can import `LOCALE_INFO` or
 * `fill` without pulling `next/headers` into a browser bundle.
 */

/**
 * The reader's language, decided on the server.
 *
 * The cookie first, because it is a choice somebody made. Then
 * `Accept-Language`, so a receptionist who has never opened the menu still
 * gets French or Arabic on their first visit. Then French, which is what the
 * office runs on.
 *
 * Deliberately not stored against the account: the language belongs to the
 * browser you are sitting at, not to the person. A shared reception machine
 * should not change language because of who signed in last.
 */
export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }

  return DEFAULT_LOCALE;
}

/** The active dictionary, for a server component. */
export async function getDict(): Promise<Dict> {
  return dictFor(await getLocale());
}
