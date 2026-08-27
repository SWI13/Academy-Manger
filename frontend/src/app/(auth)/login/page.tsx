import { redirect } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { Vfx } from "@/components/ui/Vfx";
import { getSession } from "@/lib/session";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

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
const DISCIPLINES: { icon: IconName; label: string }[] = [
  { icon: "wrench", label: "Mechanics" },
  { icon: "code", label: "IT & Coding" },
  { icon: "bolt", label: "Electrical" },
  { icon: "car", label: "Automotive" },
  { icon: "network", label: "Networking" },
];

const PRINCIPLES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "shield",
    title: "Permissions, not hidden buttons",
    body: "Five roles share one set of screens. What differs is which columns arrive — an instructor's roster carries no price, because the price is never sent.",
  },
  {
    icon: "wallet",
    title: "Recorded by one, approved by another",
    body: "Whoever takes a payment cannot be the one who confirms it arrived. Approved entries are final; a correction is a new record, never an edit.",
  },
  {
    icon: "clock",
    title: "Nothing is deleted",
    body: "Accounts are deactivated, enrolments cancelled, reviews hidden. The trail of who did what, and when, survives all of it.",
  },
];

export default async function LoginPage() {
  // Already signed in? There is nothing to do here.
  if (await getSession()) redirect("/dashboard");

  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden lg:flex-row">
      <Vfx level={3} />

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
            Every figure on your screen is one the server decided you may see.
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
                  <p className="text-sm font-semibold text-ink">{point.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                    {point.body}
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
                key={trade.label}
                className="animate-step flex items-center gap-2 text-ink-faint"
                style={{ "--step": index } as React.CSSProperties}
              >
                <Icon name={trade.icon} size={16} className="text-accent" />
                <span className="eyebrow text-ink-soft">{trade.label}</span>
              </li>
            ))}
          </ul>
          <p className="eyebrow mt-5 text-ink-faint">
            Skills today, success tomorrow
          </p>
        </div>
      </section>

      {/* ================= the form ================================== */}
      <section className="relative flex flex-1 items-center justify-center px-5 pb-12 pt-4 sm:px-8 lg:py-16">
        <div className="glass-strong fx-brackets relative w-full max-w-[26rem] rounded-xl border border-rule p-6 sm:p-8">
          <header className="mb-7">
            <h2 className="text-[30px] font-semibold leading-none text-white">
              Sign in
            </h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
              Your identifier is the one printed on your card. Accounts are
              issued by the academy — there is no public registration.
            </p>
          </header>

          <LoginForm />

          <div className="mt-7 border-t border-rule pt-5">
            <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-faint">
              <Icon name="key" size={15} className="mt-0.5 shrink-0" />
              Lost your password? Ask reception to reset it — they can issue a
              new one, but nobody can read your old one.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
