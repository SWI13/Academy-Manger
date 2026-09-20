"use client";

import type { ReactNode } from "react";

import { useDict } from "@/components/LocaleProvider";

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "accent";
type Size = "sm" | "md";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunk text-ink-soft border-rule",
  ok: "bg-ok-wash text-ok border-ok-line",
  warn: "bg-warn-wash text-warn border-warn-line",
  bad: "bg-bad-wash text-bad border-bad-line",
  info: "bg-info-wash text-info border-info-line",
  accent: "bg-accent-soft text-accent border-accent-line",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-ink-faint",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  info: "bg-info",
  accent: "bg-accent",
};

const SIZES: Record<Size, string> = {
  sm: "h-5 gap-1.5 px-1.5 text-[10.5px]",
  md: "h-6 gap-1.5 px-2 text-[11.5px]",
};

/**
 * One status vocabulary for the whole application.
 *
 * Payment, enrolment, course, review, schedule and export statuses are mapped
 * here rather than in each table, so APPROVED is the same green wherever it
 * appears and nobody has to learn two colour schemes.
 *
 * Colour is the second signal, never the only one: every badge also carries
 * its word, so the difference between approved and rejected survives a
 * monochrome print-out and a red-green colour blindness.
 */
const STATUS_TONES: Record<string, Tone> = {
  // Payments
  PENDING: "warn",
  APPROVED: "ok",
  REJECTED: "bad",
  CANCELLED: "neutral",
  // Enrolments
  ACTIVE: "ok",
  COMPLETED: "info",
  SUSPENDED: "warn",
  DROPPED: "neutral",
  // Courses
  DRAFT: "neutral",
  ARCHIVED: "neutral",
  // Reviews
  HIDDEN: "neutral",
  // People
  INACTIVE: "neutral",
  // Exports and scans
  RUNNING: "info",
  READY: "ok",
  FAILED: "bad",
  CLEAN: "ok",
  INFECTED: "bad",
  // Inventory status. AVAILABLE is neutral rather than green on purpose: a
  // chair sitting in a store is not good news, it is the ordinary case, and a
  // page of green badges makes the amber one harder to find.
  AVAILABLE: "neutral",
  IN_USE: "info",
  UNDER_REPAIR: "warn",
  MISSING: "bad",
  // Inventory condition. NEEDS_REPAIR is the one somebody has to act on, so
  // it is the one that is amber; DAMAGED is past acting on.
  NEW: "ok",
  GOOD: "ok",
  NEEDS_REPAIR: "warn",
  DAMAGED: "bad",
};

export function toneFor(status: string): Tone {
  return STATUS_TONES[status] ?? "neutral";
}

export function Badge({
  children,
  tone = "neutral",
  size = "md",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  size?: Size;
  /** A filled circle before the label. For live states in dense rows. */
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-sm border font-medium uppercase tracking-[0.04em] ${TONES[tone]} ${SIZES[size]} ${className}`}
    >
      {dot ? (
        <span aria-hidden className={`size-1.5 rounded-full ${DOTS[tone]}`} />
      ) : null}
      {children}
    </span>
  );
}

/**
 * A status string, rendered with its own colour and in sentence case.
 *
 * Accepts undefined because several statuses are optional in the schema - the
 * API always sends them, but a field with a model default is not required by
 * the contract. Rendering nothing beats rendering a badge that says
 * "Undefined".
 */
export function StatusBadge({
  status,
  size = "md",
}: {
  status?: string | null;
  size?: Size;
}) {
  const d = useDict();
  if (!status) return null;
  /*
   * The dictionary first, then sentence case as a fallback.
   *
   * The status codes come from the backend, and a new one can appear there
   * before it appears here. Falling back to the code in sentence case shows
   * something readable rather than a blank badge - and it is visibly English
   * in a French page, which is exactly the signal that a word is missing.
   */
  const known = (d.status as Record<string, string | undefined>)[status];
  const label =
    known ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return (
    <Badge tone={toneFor(status)} size={size} dot>
      {label}
    </Badge>
  );
}
