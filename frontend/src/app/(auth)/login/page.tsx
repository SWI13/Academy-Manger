import { redirect } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/Icon";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Logo } from "@/components/ui/Logo";
import { Vfx } from "@/components/ui/Vfx";
import type { Dict } from "@/lib/dict/en";
import { getDict } from "@/lib/i18n.server";
import { getSession } from "@/lib/session";

import { LoginForm } from "./LoginForm";

export async function generateMetadata() {
  return { title: (await getDict()).login.title };
}

/**
 * The only page anyone reaches without a session, and the only one running
 * the atmosphere at full strength.
 *
 * Two columns from `lg`: the academy on the left, the form on the right. Below
 * that the identity panel collapses to the logo and the tagline above the
 * form - not to nothing. The mark is what tells somebody which building they
 * have walked into, and a bare form with a heading on it could belong to
 * anyone.
 *
 * The disciplines and the tagline are the ones printed on the official
 * artwork. Nothing on this page was invented for it: the three rules below
 * are the actual rules the platform enforces, which is a better use of the
 * one screen everybody reads than a slogan would be.
 */

/** The trades, as they appear on the official extended lockup. */
const DISCIPLINES: { icon: IconName; key: keyof Dict["login"]["trades"] }[] = [
  { icon: "wrench", key: "mechanics" },
  { icon: "code", key: "it" },
  { icon: "bolt", key: "electrical" },
  { icon: "car", key: "automotive" },
  { icon: "network", key: "networking" },
];

const PRINCIPLES: {
  icon: IconName;
  title: keyof Dict["login"]["principles"];
  body: keyof Dict["login"]["principles"];
}[] = [
  { icon: "shield", title: "permissionsTitle", body: "permissionsBody" },
  { icon: "wallet", title: "moneyTitle", body: "moneyBody" },
  { icon: "clock", title: "trailTitle", body: "trailBody" },
];

export default async function LoginPage() {
  // Already signed in? There is nothing to do here.
  if (await getSession()) redirect("/dashboard");

  const d = await getDict();

  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden lg:flex-row">
      <Vfx level={3} />

      {/*
        The one control on this page that is not the form. Somebody who cannot
        read the language currently on screen needs to change it *before* they
        sign in, not from a menu inside the application.
      */}
      <div className="absolute end-4 top-4 z-10 sm:end-6 sm:top-6">
        <LanguageSwitcher variant="bare" />
      </div>

      {/* ================= the academy =============================== */}
      <section className="relative flex flex-col justify-between gap-10 px-6 pb-8 pt-10 sm:px-10 lg:w-[54%] lg:px-16 lg:py-16">
        {/* --- the mark ------------------------------------------------ */}
        <div className="animate-mark">
          {/* The extended lockup carries the disciplines and the tagline in
              the artwork itself, so at lg the panel does not repeat them in
              type. Below lg it is the compact lockup and the strip below
              does the work. */}
          <Logo
            variant="extended"
            height={132}
            priority
            title="SM Academy"
            className="hidden lg:block"
          />
          <Logo
            height={54}
            priority
            title="SM Academy"
            className="lg:hidden"
          />
        </div>

        {/* --- the claim ----------------------------------------------- */}
        <div className="hidden lg:block">
          <h1 className="animate-step max-w-xl text-[38px] font-semibold leading-[1.15] text-white">
            {d.login.claim}
          </h1>

          <span
            aria-hidden
            className="fx-rule animate-step mt-7 block h-px w-full max-w-xl"
            style={{ "--step": 1 } as React.CSSProperties}
          />

          <ul className="mt-8 flex max-w-xl flex-col gap-6">
            {PRINCIPLES.map((point, index) => (
              <li
                key={point.title}
                className="animate-step flex gap-4"
                style={{ "--step": index + 2 } as React.CSSProperties}
              >
                <span
                  aria-hidden
                  className="glass flex size-10 shrink-0 items-center justify-center rounded-md border border-accent-line text-accent"
                >
                  <Icon name={point.icon} size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {d.login.principles[point.title]}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                    {d.login.principles[point.body]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* --- the trades ---------------------------------------------- */}
        <div>
          <span
            aria-hidden
            className="fx-hatch mb-5 hidden h-1 w-24 lg:block"
          />
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:gap-x-7">
            {DISCIPLINES.map((trade, index) => (
              <li
                key={trade.key}
                className="animate-step flex items-center gap-2 text-ink-faint"
                style={{ "--step": index } as React.CSSProperties}
              >
                <Icon name={trade.icon} size={16} className="text-accent" />
                <span className="eyebrow text-ink-soft">
                  {d.login.trades[trade.key]}
                </span>
              </li>
            ))}
          </ul>
          <p className="eyebrow mt-5 text-ink-faint">{d.login.tagline}</p>
        </div>
      </section>

      {/* ================= the form ================================== */}
      <section className="relative flex flex-1 items-center justify-center px-5 pb-12 pt-4 sm:px-8 lg:py-16">
        <div className="glass-strong fx-brackets relative w-full max-w-[26rem] rounded-xl border border-rule p-6 sm:p-8">
          <header className="mb-7">
            <h2 className="text-[30px] font-semibold leading-none text-white">
              {d.login.title}
            </h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
              {d.login.lede}
            </p>
          </header>

          <LoginForm />

          <div className="mt-7 border-t border-rule pt-5">
            <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-faint">
              <Icon name="key" size={15} className="mt-0.5 shrink-0" />
              {d.login.lostPassword}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
