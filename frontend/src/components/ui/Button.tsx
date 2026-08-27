import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

import { Icon, Spinner, type IconName } from "./Icon";

type Variant =
  | "primary"
  | "brand"
  | "secondary"
  | "quiet"
  | "danger"
  | "ghost";
type Size = "sm" | "md" | "lg";

/*
 * One button, six intents, three sizes.
 *
 * Every dimension is here rather than at the call site, so "Approve" on the
 * payment screen and "Save sheet" on the mark sheet are the same height to
 * the pixel. A button that is 33px on one page and 34px on the next is a
 * thing nobody can name and everybody feels.
 *
 * The press is a one-pixel translate, not a scale: scaling a bordered
 * rectangle softens its edges for the duration of the animation.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "border-transparent bg-accent text-accent-ink shadow-xs hover:bg-accent-hover active:translate-y-px disabled:bg-accent/45 disabled:shadow-none",
  /*
   * The institute's own crimson, and the only control that wears it.
   *
   * Kept apart from `danger` on purpose: `danger` is a wash with red text on
   * it, this is solid crimson with white on it, and the two never appear in
   * the same place - the sign-in screen has no destructive action and the
   * workspace has no brand button. The `sheen` class gives it a light sweep
   * on hover, which the reduced-motion block switches off entirely.
   */
  brand:
    "sheen border-transparent bg-brand text-brand-ink shadow-sm hover:bg-brand-hover hover:shadow-md active:translate-y-px disabled:bg-brand/45 disabled:shadow-none",
  secondary:
    "border-rule-strong bg-surface text-ink shadow-xs hover:bg-sunk active:translate-y-px disabled:opacity-50 disabled:shadow-none",
  quiet:
    "border-transparent bg-transparent text-ink-soft hover:bg-sunk hover:text-ink active:translate-y-px disabled:opacity-50",
  danger:
    "border-bad-line bg-bad-wash text-bad hover:bg-bad/15 active:translate-y-px disabled:opacity-50",
  ghost:
    "border-transparent bg-transparent text-accent hover:bg-accent-soft active:translate-y-px disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-[13px]",
  md: "h-9 gap-2 px-3.5 text-sm",
  lg: "h-11 gap-2 px-5 text-sm",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  /** Leading glyph. Replaced by the spinner while busy, so nothing shifts. */
  icon?: IconName;
  /** Trailing glyph, for "Open ->" and the like. */
  trailing?: IconName;
  block?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  icon,
  trailing,
  block = false,
  disabled,
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      // A busy button is disabled, not merely styled as such. Two clicks on
      // "Approve" while the first is in flight is a real double-approval.
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border font-medium transition-[background-color,color,box-shadow,transform,opacity] duration-[110ms] disabled:cursor-not-allowed disabled:active:translate-y-0 ${
        VARIANTS[variant]
      } ${SIZES[size]} ${block ? "w-full" : ""} ${className}`}
    >
      {busy ? (
        <Spinner size={size === "lg" ? 16 : 14} />
      ) : icon ? (
        <Icon name={icon} size={size === "sm" ? 14 : 16} />
      ) : null}
      {children}
      {trailing && !busy ? (
        <Icon name={trailing} size={size === "sm" ? 14 : 16} />
      ) : null}
    </button>
  );
}

/**
 * A link that looks like a button.
 *
 * A separate component rather than a `<Button>` inside a `<Link>`: nesting an
 * interactive element inside another is invalid, and it gives a keyboard user
 * two stops for one control. What navigates is an anchor; what performs an
 * action is a button. That distinction is the whole of the difference.
 */
export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  icon,
  trailing,
  block = false,
  className = "",
  children,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  trailing?: IconName;
  block?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link
      href={href}
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border font-medium transition-[background-color,color,box-shadow,transform] duration-[110ms] ${
        VARIANTS[variant]
      } ${SIZES[size]} ${block ? "w-full" : ""} ${className}`}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} /> : null}
      {children}
      {trailing ? <Icon name={trailing} size={size === "sm" ? 14 : 16} /> : null}
    </Link>
  );
}

/**
 * A square button that is only an icon.
 *
 * `label` is required rather than optional: an icon-only control with no
 * accessible name is a control a screen reader announces as "button", and
 * this is how the close on a dialog stays operable.
 */
export function IconButton({
  icon,
  label,
  variant = "quiet",
  size = "md",
  className = "",
  ...rest
}: Omit<Props, "icon" | "children" | "trailing" | "block"> & {
  icon: IconName;
  label: string;
}) {
  const box = size === "sm" ? "size-8" : size === "lg" ? "size-11" : "size-9";
  return (
    <button
      {...rest}
      type={rest.type ?? "button"}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border transition-colors duration-[110ms] disabled:cursor-not-allowed ${VARIANTS[variant]} ${box} ${className}`}
    >
      <Icon name={icon} size={size === "sm" ? 15 : 17} />
    </button>
  );
}
