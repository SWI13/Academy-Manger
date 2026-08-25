import { redirect } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { getSession } from "@/lib/session";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · SM Academy" };

/**
 * The only page anyone reaches without a session.
 *
 * Two panels from `lg` up: the form on the left at a comfortable reading
 * width, and on the right the three sentences that describe how this platform
 * treats a record. Not marketing - the people signing in here work at one
 * institute and were given their account by reception. It is there because a
 * sign-in screen is a wall of nothing otherwise, and because the rules on it
 * are the ones staff most often ask about.
 */
export default async function LoginPage() {
  // Already signed in? There is nothing to do here.
  if (await getSession()) redirect("/dashboard");

  return (
    <main className="flex min-h-svh flex-col lg:flex-row">
      {/* --- the form ------------------------------------------------- */}
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <header className="mb-8">
            <span
              aria-hidden
              className="mb-6 flex size-11 items-center justify-center rounded-xl bg-accent text-sm font-bold tracking-tight text-accent-ink shadow-sm"
            >
              SM
            </span>
            <h1 className="text-2xl font-semibold text-ink">Sign in</h1>
            <p className="mt-1.5 text-[15px] text-ink-soft">
              SM Academy — course and institute management.
            </p>
          </header>

          <LoginForm />

          <p className="mt-8 border-t border-rule pt-6 text-[13px] leading-relaxed text-ink-faint">
            Lost your password? Ask reception to reset it — they can issue a new
            one, but nobody can read your old one.
          </p>
        </div>
      </div>

      {/* --- the panel, from lg up ------------------------------------ */}
      <aside className="relative hidden w-[46%] max-w-2xl flex-col justify-center overflow-hidden bg-nav px-14 lg:flex">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-accent/20 blur-3xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-accent/10 blur-3xl"
        />

        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.055em] text-nav-accent">
            How this platform works
          </p>
          <h2 className="mt-4 max-w-md text-[26px] font-semibold leading-snug text-nav-ink">
            Every figure on your screen is one the server decided you may see.
          </h2>

          <ul className="mt-10 flex max-w-md flex-col gap-7">
            {[
              {
                icon: "shield" as const,
                title: "Permissions are not a matter of hidden buttons",
                body: "Five roles share one set of screens. What differs is which columns arrive — a professor's roster carries no price, because the price is never sent.",
              },
              {
                icon: "wallet" as const,
                title: "Money is recorded, then approved by someone else",
                body: "Whoever takes a payment cannot be the one who confirms it arrived. Approved entries are final; a correction is a new record, never an edit.",
              },
              {
                icon: "clock" as const,
                title: "Nothing is deleted",
                body: "Accounts are deactivated, enrolments cancelled, reviews hidden. The trail of who did what, and when, survives all of it.",
              },
            ].map((point) => (
              <li key={point.title} className="flex gap-4">
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-nav-rule bg-nav-raised text-nav-accent"
                >
                  <Icon name={point.icon} size={17} />
                </span>
                <div>
                  <p className="text-sm font-medium text-nav-ink">{point.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-nav-ink-soft">
                    {point.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
