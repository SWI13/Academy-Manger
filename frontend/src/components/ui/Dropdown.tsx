"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Icon, type IconName } from "./Icon";

/**
 * A menu hanging off a button.
 *
 * Small enough to be worth writing rather than depending on: the behaviours
 * that actually matter are closing on escape, closing on a click elsewhere,
 * returning focus to the trigger, and letting the arrow keys walk the items.
 * All four are here, and none of them needs a library.
 */
export function Dropdown({
  trigger,
  children,
  align = "end",
  label,
}: {
  trigger: (props: {
    open: boolean;
    onClick: () => void;
    id: string;
    ref: React.Ref<HTMLButtonElement>;
  }) => React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      const items = Array.from(
        menu.current?.querySelectorAll<HTMLElement>("[data-menu-item]") ?? [],
      ).filter((item) => !item.hasAttribute("disabled"));
      if (!items.length) return;

      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === "ArrowDown"
          ? items[(index + 1) % items.length]
          : items[(index - 1 + items.length) % items.length];
      next?.focus();
    }

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      {trigger({
        open,
        id,
        ref: button,
        onClick: () => setOpen((current) => !current),
      })}

      {open ? (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          aria-labelledby={id}
          onClick={() => setOpen(false)}
          className={`animate-pop absolute top-[calc(100%+6px)] z-50 min-w-56 overflow-hidden rounded-xl border border-rule bg-raised p-1 shadow-lg ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** One row in a menu. Renders as a button; `href` is the caller's job to wrap. */
export function MenuItem({
  icon,
  children,
  onClick,
  tone = "plain",
  disabled,
}: {
  icon?: IconName;
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "plain" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-menu-item
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === "danger"
          ? "text-bad hover:bg-bad-wash"
          : "text-ink-soft hover:bg-sunk hover:text-ink"
      }`}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow px-2.5 pb-1 pt-2">{children}</p>;
}

export function MenuSeparator() {
  return <hr className="my-1 border-rule" />;
}
