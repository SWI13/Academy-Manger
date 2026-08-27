import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

import { Icon, Spinner, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "quiet" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

/*
 * One button, five intents, three sizes.
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
  /*
   * The academy's red, and the only thing in the interface that is a solid
   * field of it.
   *
   * `bg-accent-fill` rather than `bg-accent`: the logo's own #ed1c24 puts
   * white at 4.38:1, which fails AA for a 14px label. This is a shade deeper,
   * clears 5.2:1, and reads as the same red beside the mark. The hover
   * brightens towards the logo red without crossing back under the line.
   *
   * The glow is a red bloom rather than a black drop shadow, because on a
   * black page a drop shadow is invisible and the light is what gives the
   * control its edge.
   */
  primary:
    "sheen border-transparent bg-accent-fill text-accent-ink shadow-[0_2px_10px_-2px_rgb(237_28_36/0.5)] hover:bg-accent-fill-hover hover:shadow-[0_4px_18px_-2px_rgb(237_28_36/0.65)] active:translate-y-px disabled:bg-accent-fill/40 disabled:shadow-none",
  /*
   * Dark glass with a hairline. Its hover is where the red enters - the edge
   * lights up rather than the field filling in, so a row of secondary buttons
   * never competes with the one primary among them.
   */
  secondary:
    "glass border-rule-strong text-ink hover:border-accent-line hover:text-white active:translate-y-px disabled:opacity-50",
  quiet:
    "border-transparent bg-transparent text-ink-soft hover:bg-white/[0.06] hover:text-ink active:translate-y-px disabled:opacity-50",
  /*
   * Destructive, and deliberately not the brand red: a wash with orange-red
   * text and, at every call site, an icon and a verb. On a screen where the
   * primary action is also red, hue alone cannot be what separates "confirm"
   * from "delete".
   */
  danger:
    "border-bad-line bg-bad-wash text-bad hover:border-bad hover:bg-bad/20 active:translate-y-px disabled:opacity-50",
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
