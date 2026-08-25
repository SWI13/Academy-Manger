import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink border-accent hover:opacity-90 disabled:opacity-50",
  secondary:
    "bg-surface text-ink border-rule-strong hover:bg-sunk disabled:opacity-50",
  quiet:
    "bg-transparent text-ink-soft border-transparent hover:bg-sunk hover:text-ink disabled:opacity-50",
  danger: "bg-bad-wash text-bad border-bad/30 hover:bg-bad/15 disabled:opacity-50",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
};

export function Button({
  variant = "secondary",
  busy = false,
  disabled,
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      // A busy button is disabled, not just styled as such. Two clicks on
      // "Approve" while the first is in flight is a real double-approval.
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {busy && (
        <span
          aria-hidden
          className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
