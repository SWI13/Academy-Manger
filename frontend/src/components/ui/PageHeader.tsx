import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "./Icon";

/**
 * The way back, on its own.
 *
 * For a page whose heading is a card rather than a title - a profile, where
 * the name sits beside the avatar and repeating it above would be the same
 * word twice.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group -ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-ink-soft transition-colors hover:text-ink"
    >
      <Icon
        name="arrow-left"
        size={15}
        className="transition-transform duration-[110ms] group-hover:-translate-x-0.5"
      />
      {label}
    </Link>
  );
}

/**
 * The top of every page, laid out the same way every time.
 *
 * Back link, then title, then the identifier under it, then whatever action
 * belongs to the whole page on the right. The order is fixed so that moving
 * between a course, a payment and a person does not move the thing you were
 * about to read.
 *
 * `lede` is for the sentence that explains the model - how an enrolment
 * freezes a price, why an approved payment is final. Those sentences are the
 * reason this application is comprehensible, so they get a place in the
 * layout rather than being squeezed in wherever there was room.
 */
export function PageHeader({
  title,
  lede,
  eyebrow,
  back,
  badge,
  actions,
  className = "",
}: {
  title: ReactNode;
  lede?: ReactNode;
  /** The identifier or context line under the title. */
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  /** Status, beside the title rather than below it. */
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`relative flex flex-col gap-3 ${className}`}>
      {back ? (
        <Link
          href={back.href}
          className="group -ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-ink-soft transition-colors hover:text-ink"
        >
          <Icon
            name="arrow-left"
            size={15}
            className="transition-transform duration-[110ms] group-hover:-translate-x-0.5"
          />
          {back.label}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-[23px] font-semibold text-white sm:text-[26px]">
              {title}
            </h1>
            {badge}
          </div>
          {eyebrow ? (
            <p className="mt-1 text-sm text-ink-soft">{eyebrow}</p>
          ) : null}
          {lede ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
              {lede}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {/*
        The red hairline under every page title - the same short solid segment
        fading to nothing that sits under the wordmark in the logo. It is the
        one piece of the brand that appears on every single screen, which is
        what keeps forty pages feeling like one product.
      */}
      <span aria-hidden className="fx-rule mt-1 block h-px w-full max-w-md" />
    </header>
  );
}
