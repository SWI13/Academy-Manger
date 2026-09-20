"use client";

import type { ReactNode } from "react";


import { Icon, type IconName } from "./Icon";
import { useDict, useFill } from "@/components/LocaleProvider";

/**
 * Nothing here, said properly.
 *
 * "No data" tells someone the request worked and nothing else. Every empty
 * state in this application says what would appear here, and - where there
 * is one - offers the action that would fill it. The difference between "No
 * pending payments" and "You are all caught up" is the difference between a
 * screen that failed and a screen with good news on it.
 */
export function EmptyState({
  icon = "layers",
  title,
  description,
  action,
  tone = "neutral",
  className = "",
}: {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** `ok` for the caught-up case: an empty queue is not a disappointment. */
  tone?: "neutral" | "ok";
  className?: string;
}) {
  return (
    <div
      className={`glass flex flex-col items-center justify-center rounded-xl border border-dashed border-rule px-6 py-12 text-center ${className}`}
    >
      <span
        aria-hidden
        className={`mb-3 flex size-11 items-center justify-center rounded-full border ${
          tone === "ok"
            ? "border-ok-line bg-ok-wash text-ok"
            : "border-rule bg-sunk text-ink-faint"
        }`}
      >
        <Icon name={tone === "ok" ? "check" : icon} size={19} />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Something went wrong, said without the stack trace.
 *
 * The wording never carries the backend's own error text. A page that could
 * not load says so; what it must not do is repeat a message written for a
 * developer to somebody trying to take a payment.
 */
export function ErrorState({
  title,
  description,
  action,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  const d = useDict();
  return (
    <div
      role="alert"
      className="glass flex flex-col items-center justify-center rounded-xl border border-rule px-6 py-12 text-center"
    >
      <span
        aria-hidden
        className="mb-3 flex size-11 items-center justify-center rounded-full border border-warn-line bg-warn-wash text-warn"
      >
        <Icon name="alert" size={19} />
      </span>
      <p className="text-sm font-medium text-ink">
        {title ?? d.empty.errorTitle}
      </p>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
        {description ?? d.empty.errorBody}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * A screen this role does not include.
 *
 * Reached by typing the URL, or by following a stale link - the navigation
 * does not offer it. What it replaces is worse than nothing: a page whose
 * only fetch came back 403 renders "could not be loaded", which reads as a
 * broken server rather than as a boundary.
 *
 * This is not what enforces the boundary. Django refuses the request whatever
 * this renders, and it deliberately says no more than that the role does not
 * include it - not what is behind it, nor whether anything is.
 */
export function NoAccess({
  what,
}: {
  /** Sentence-case subject: d.nav.payments, "The gradebook". */
  what?: string;
}) {
  const d = useDict();
  const t = useFill();
  return (
    <div className="glass flex flex-col items-center justify-center rounded-xl border border-rule px-6 py-14 text-center">
      <span
        aria-hidden
        className="mb-3 flex size-11 items-center justify-center rounded-full border border-rule bg-sunk text-ink-faint"
      >
        <Icon name="lock" size={19} />
      </span>
      <p className="text-sm font-medium text-ink">
        {t(d.empty.noAccessTitle, { what: what ?? d.empty.noAccessSubject })}
      </p>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
        {d.empty.noAccessBody}
      </p>
    </div>
  );
}
