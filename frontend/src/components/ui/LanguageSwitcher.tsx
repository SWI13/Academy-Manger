"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useDict, useLocale } from "@/components/LocaleProvider";
import { LOCALES, LOCALE_COOKIE, LOCALE_INFO, type Locale } from "@/lib/i18n";

import { Dropdown } from "./Dropdown";
import { Icon } from "./Icon";

/**
 * Three languages, chosen from a menu.
 *
 * Each language is named in itself — العربية, never "Arabic" written in
 * French. Somebody reaching for this menu is by definition not reading the
 * language currently on screen.
 *
 * ---------------------------------------------------------------------------
 * Why a cookie and a refresh rather than client-side switching
 * ---------------------------------------------------------------------------
 * The language is decided on the server: it sets `lang` and `dir` on <html>,
 * picks the typeface, and renders most of the application's copy straight
 * into the HTML. Swapping strings in the browser would leave all three of
 * those wrong. So this writes the cookie and asks the server to render the
 * page again — one round trip, and everything agrees.
 *
 * The cookie is deliberately not `httpOnly`: it is a display preference with
 * no bearing on what anyone may see, and this component has to be able to
 * write it. Nothing about authorization is decided here.
 *
 * It is also not stored against the account. A shared machine at reception
 * should not change language because of who signed in last.
 */
/**
 * Write the preference down.
 *
 * At module scope rather than inside the component: assigning to
 * `document.cookie` is a side effect on the document, and React's rules
 * (rightly) do not want to see an assignment to something outside the
 * component from within its body. A year, path-wide, and `SameSite=Lax`
 * because a display preference has no reason to travel cross-site.
 */
function remember(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
}

export function LanguageSwitcher({
  /** `bare` on the sign-in screen, where there is no chrome to sit in. */
  variant = "chrome",
}: {
  variant?: "chrome" | "bare";
}) {
  const router = useRouter();
  const dict = useDict();
  const { locale } = useLocale();
  const [pending, start] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    remember(next);
    start(() => router.refresh());
  }

  return (
    <Dropdown
      label={dict.meta.changeLanguage}
      trigger={({ open, onClick, id, ref }) => (
        <button
          ref={ref}
          id={id}
          type="button"
          onClick={onClick}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={dict.meta.changeLanguage}
          aria-busy={pending || undefined}
          className={`inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors ${
            variant === "bare"
              ? "glass border border-rule text-ink-soft hover:border-accent-line hover:text-ink"
              : "text-ink-soft hover:bg-white/[0.06] hover:text-ink"
          }`}
        >
          <Icon name="globe" size={16} />
          <span className="tabular">{LOCALE_INFO[locale].short}</span>
          <Icon
            name="chevron-down"
            size={13}
            className={`transition-transform duration-[110ms] ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      )}
    >
      {LOCALES.map((code) => {
        const chosen = code === locale;
        return (
          <button
            key={code}
            type="button"
            role="menuitemradio"
            aria-checked={chosen}
            data-menu-item
            onClick={() => choose(code)}
            /*
             * Each option is set in its own script and its own direction, so
             * العربية reads correctly even while the menu around it is in
             * French. `lang` is what tells a screen reader to change voice.
             */
            lang={code}
            dir={LOCALE_INFO[code].dir}
            className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${
              chosen
                ? "bg-accent-soft text-accent"
                : "text-ink-soft hover:bg-white/[0.06] hover:text-ink"
            }`}
          >
            <span>{LOCALE_INFO[code].label}</span>
            {chosen ? <Icon name="check" size={15} /> : null}
          </button>
        );
      })}
    </Dropdown>
  );
}
