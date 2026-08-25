import type { ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

/**
 * The panel every screen is built from.
 *
 * One border, one radius, one shadow, one padding scale. Pages compose these
 * rather than writing `rounded border border-rule bg-surface p-4` in forty
 * places, which is how the padding on one screen quietly becomes 12px while
 * everywhere else it is 16.
 */
export function Card({
  children,
  className = "",
  as: Element = "section",
  padded = true,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
  /** Off when the card holds a table or list that must reach its own edges. */
  padded?: boolean;
} & { "aria-label"?: string }) {
  return (
    <Element
      {...rest}
      className={`rounded-xl border border-rule bg-surface shadow-xs ${
        padded ? "p-4 sm:p-5" : ""
      } ${className}`}
    >
      {children}
    </Element>
  );
}

/**
 * A heading inside a card, with room for a control on the right.
 *
 * The rule under it is drawn only when there is content below to separate,
 * which is why `divider` is a decision and not a default.
 */
export function CardHeader({
  title,
  description,
  icon,
  action,
  divider = false,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  divider?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 ${
        divider ? "border-b border-rule pb-3" : ""
      } ${className}`}
    >
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          {icon ? <Icon name={icon} size={16} className="text-ink-faint" /> : null}
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-ink-soft">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * A titled band between sections of a page.
 *
 * Not a card: this is the label above one, and it carries the optional
 * "see all" that stops a dashboard section from being a dead end.
 */
export function SectionHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
