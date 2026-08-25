type Tone = "neutral" | "ok" | "warn" | "bad" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunk text-ink-soft border-rule",
  ok: "bg-ok-wash text-ok border-ok/25",
  warn: "bg-warn-wash text-warn border-warn/25",
  bad: "bg-bad-wash text-bad border-bad/25",
  info: "bg-info-wash text-info border-info/25",
};

/**
 * One status vocabulary for the whole app.
 *
 * Payment, enrolment, course, review and export statuses are mapped here
 * rather than in each table, so APPROVED is the same green wherever it
 * appears and nobody has to learn two colour schemes.
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
  // Exports and scans
  RUNNING: "info",
  READY: "ok",
  FAILED: "bad",
  CLEAN: "ok",
  INFECTED: "bad",
};

export function toneFor(status: string): Tone {
  return STATUS_TONES[status] ?? "neutral";
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
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
export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const label =
    status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return <Badge tone={toneFor(status)}>{label}</Badge>;
}
