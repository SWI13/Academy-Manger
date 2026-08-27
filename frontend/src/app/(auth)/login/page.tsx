import { redirect } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/Icon";
import { Crest, Wordmark } from "@/components/ui/Logo";
import { getSession } from "@/lib/session";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · SM Academy" };

/**
 * The only page anyone reaches without a session, and the only one that wears
 * the institute's colours.
 *
 * Two halves from `lg` up: the form on the left at a comfortable reading
 * width, and on the right a crimson field carrying the crest. Below that
 * width the field becomes a band above the form rather than disappearing —
 * the crest is the thing that says which building you have walked into, and
 * dropping it on a phone would leave a bare form with a heading.
 *
 * The three points on the field are not marketing. They are the rules staff
 * ask about most: who may approve money, what the screens actually hide, and
 * why nothing is ever deleted. A sign-in screen is the one moment everybody
 * reads something, so they are what it says.
 */

const PRINCIPLES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "shield",
    title: "Permissions, not hidden buttons",
    body: "Five roles share one set of screens. What differs is which columns arrive — a professor's roster carries no price, because the price is never sent.",
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
    <main className="brand-scope flex min-h-svh flex-col lg:flex-row-reverse">
      {/* ================= the crimson field ========================== */}
      <aside className="brand-field brand-grain relative isolate overflow-hidden lg:w-[46%] lg:max-w-2xl">
        <div className="brand-diaper absolute inset-0" aria-hidden />

        {/* the two drifting pools of light */}
        <span
          aria-hidden
          className="brand-drift pointer-events-none absolute -right-24 -top-32 size-[28rem] rounded-full bg-white/10 blur-3xl"
        />
        <span
          aria-hidden
          className="brand-drift-slow pointer-events-none absolute -bottom-40 -left-28 size-[26rem] rounded-full bg-brand-gold/10 blur-3xl"
        />

        {/* the crest, oversized and half off the edge, as a watermark */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 bottom-8 hidden opacity-[0.06] lg:block"
        >
          <Crest size={420} detailed />
        </span>

        <div className="brand-scope-invert relative flex h-full flex-col justify-between gap-10 px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
          {/* --- the mark ---------------------------------------------- */}
          <div className="animate-crest">
            <Wordmark size={52} detailed subtitle="Institute portal" invert />
          </div>

          {/* --- the three rules --------------------------------------- */}
          <div className="hidden lg:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-gold-soft">
              How this platform works
            </p>
            <h2 className="animate-step mt-4 max-w-md font-display text-[30px] leading-[1.25] text-white">
              Every figure on your screen is one the server decided you may see.
            </h2>

            <span
              aria-hidden
              className="brand-rule animate-step mt-8 block h-px w-full max-w-md"
              style={{ "--step": 1 } as React.CSSProperties}
            />

            <ul className="mt-8 flex max-w-md flex-col gap-6">
              {PRINCIPLES.map((point, index) => (
                <li
                  key={point.title}
                  className="animate-step flex gap-4"
                  style={{ "--step": index + 2 } as React.CSSProperties}
                >
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand-gold/35 bg-white/[0.07] text-brand-gold-soft backdrop-blur-sm"
                  >
                    <Icon name={point.icon} size={17} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {point.title}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-white/65">
                      {point.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* --- the footing ------------------------------------------- */}
          <p className="hidden text-[11px] uppercase tracking-[0.16em] text-white/55 lg:block">
            Course and institute management
          </p>
        </div>
      </aside>

      {/* ================= the form ================================== */}
      <div className="relative flex flex-1 items-center justify-center px-5 py-12 sm:px-8 lg:py-16">
        {/* a whisper of the crimson bleeding onto the paper side */}
        <span
          aria-hidden
          className="pointer-events-none absolute -left-40 top-1/3 size-96 rounded-full bg-brand/[0.045] blur-3xl"
        />

        <div className="relative w-full max-w-sm">
          <header className="mb-8">
            {/* On a phone the field above is a band, so the crest is not
                repeated here; from lg the form needs its own anchor. */}
            <span className="mb-6 hidden lg:block">
              <Crest size={46} detailed />
            </span>

            <h1 className="font-display text-[34px] leading-none text-ink">
              Sign in
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
              Your identifier is the one printed on your card. Accounts are
              issued by the institute — there is no public registration.
            </p>
          </header>

          <LoginForm />

          <div className="mt-8 border-t border-rule pt-6">
            <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-faint">
              <Icon name="key" size={15} className="mt-0.5 shrink-0" />
              Lost your password? Ask reception to reset it — they can issue a
              new one, but nobody can read your old one.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
