"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useDict } from "@/components/LocaleProvider";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import type { Permission, RoleCode } from "@/lib/permissions";

import { GROUP_KEYS, NAV_GROUPS, visibleItems, type NavItem } from "./nav-items";

/**
 * The rail.
 *
 * Three widths, no toggle and no stored preference: a full column from 1024px
 * up, an icon rail between 768 and 1024 where the horizontal space is worth
 * more than the words, and a drawer below that. A collapse button would add a
 * setting to remember, a state to get wrong, and a decision to make on every
 * screen - for a layout the viewport already answers.
 *
 * It keeps its dark palette in both themes. This is the one piece of chrome
 * that says which product this is, and chrome that inverts with the theme
 * says nothing.
 */

type Props = {
  permissions: Permission[];
  role: RoleCode;
  fullName: string;
  publicId: string;
  unread: number;
};

export function Sidebar(props: Props) {
  return (
    <aside className="sticky top-0 hidden h-svh shrink-0 flex-col border-e border-nav-rule bg-nav md:flex md:w-[68px] lg:w-64">
      <Brand role={props.role} />
      <Nav {...props} />
      <Rule />
      <Identity {...props} />
    </aside>
  );
}

function Rule() {
  return <hr className="mx-3 border-nav-rule" />;
}

function Brand({ role }: { role: RoleCode }) {
  const d = useDict();
  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 px-3 lg:px-4">
      <Link
        href="/dashboard"
        aria-label={d.nav.toDashboard}
        className="flex min-w-0 items-center gap-2.5 rounded-md py-1"
      >
        {/*
          Two crops of the same official artwork, chosen by how much room the
          rail has. The narrow rail gets the square icon, because the full
          lockup at 44px wide would render ACADEMY as a grey smear; the wide
          rail gets the lockup, which already contains the name and so is not
          followed by the name written out again.
        */}
        <Logo variant="icon" height={32} className="shrink-0 lg:hidden" />
        <span className="hidden min-w-0 lg:block">
          <Logo height={30} title="SM Academy" />
          <span className="mt-1 block truncate text-[11px] font-medium leading-tight text-nav-ink-faint">
            {d.roles[role]}
          </span>
        </span>
      </Link>
    </div>
  );
}

function Nav({ permissions, unread }: Props) {
  const d = useDict();
  const pathname = usePathname();
  const items = visibleItems(permissions);

  return (
    <nav
      aria-label={d.nav.main}
      className="scroll-slim flex-1 overflow-y-auto px-2.5 pb-4 lg:px-3"
    >
      {NAV_GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (!groupItems.length) return null;

        return (
          <div key={group} className="mb-5 last:mb-0">
            <p className="hidden px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-nav-ink-faint lg:block">
              {d.nav[GROUP_KEYS[group]]}
            </p>
            {/* On the icon rail the group heading would be a word in a column
                with no room for one, so the groups are separated by space. */}
            <ul className="flex flex-col gap-0.5">
              {groupItems.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    pathname={pathname}
                    badge={item.href === "/notifications" ? unread : 0}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function NavLink({
  item,
  pathname,
  badge = 0,
  showLabel = false,
}: {
  item: NavItem;
  pathname: string;
  badge?: number;
  /** Forces the label on, for the mobile drawer where width is not the issue. */
  showLabel?: boolean;
}) {
  const d = useDict();
  const label = d.nav[item.key];
  const active =
    pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={showLabel ? undefined : label}
      className={`group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors duration-[110ms] ${
        active
          ? "bg-nav-active font-medium text-nav-ink"
          : "text-nav-ink-soft hover:bg-nav-raised hover:text-nav-ink"
      } ${showLabel ? "" : "justify-center lg:justify-start"}`}
    >
      {/* The active marker: a short bar off the left edge rather than a
          filled block, so the row stays quiet and the eye still finds it. */}
      {active ? (
        <span
          aria-hidden
          className="absolute -start-2.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-e-full bg-nav-accent lg:-start-3"
        />
      ) : null}

      <Icon
        name={item.icon}
        size={18}
        className={active ? "text-nav-accent" : "text-nav-ink-faint group-hover:text-nav-ink-soft"}
      />

      <span className={showLabel ? "flex-1" : "sr-only flex-1 lg:not-sr-only"}>
        {label}
      </span>

      {badge > 0 ? (
        <span
          className={`tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-fill px-1.5 text-[11px] font-semibold text-accent-ink ${
            showLabel ? "" : "absolute end-1.5 top-1 lg:static lg:end-auto lg:top-auto"
          }`}
        >
          {badge > 99 ? "99+" : badge}
          <span className="sr-only"> {d.shell.unread}</span>
        </span>
      ) : null}
    </Link>
  );
}

function Identity({ fullName, publicId, role }: Props) {
  const d = useDict();
  return (
    <div className="p-3">
      <Link
        href="/account"
        className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-nav-raised"
        title={d.nav.account}
      >
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-nav-raised text-[11px] font-semibold text-nav-ink"
        >
          {initials(fullName)}
        </span>
        <span className="hidden min-w-0 flex-1 lg:block">
          <span className="block truncate text-[13px] font-medium leading-tight text-nav-ink">
            {fullName}
          </span>
          <span className="tabular block truncate text-[11px] leading-tight text-nav-ink-faint">
            {publicId} · {d.roles[role]}
          </span>
        </span>
        <Icon
          name="chevron-right"
          size={14}
          className="hidden text-nav-ink-faint lg:block"
        />
      </Link>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The same navigation, as a drawer.
 *
 * Below `md` the rail becomes a panel that slides in over the page. It closes
 * on navigation, on escape and on a tap outside - the three ways a person
 * expects to get out of one - and the backdrop is inert to touch scrolling so
 * the page underneath does not move while it is open.
 */
export function MobileNav(props: Props) {
  const d = useDict();
  const pathname = usePathname();

  /*
   * The drawer remembers which route it was opened on, and is open only while
   * that is still the route. Navigating therefore closes it without an effect
   * that watches the path and calls setState - the close is a consequence of
   * the navigation rather than a reaction to it.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenedAt(null);
    }
    document.addEventListener("keydown", onKey);
    // The body must not scroll behind an open drawer.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const items = visibleItems(props.permissions);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={d.nav.openNavigation}
        aria-expanded={open}
        className="relative -ms-1 inline-flex size-9 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-white/[0.06] hover:text-ink md:hidden"
      >
        <Icon name="menu" size={20} />
        {props.unread > 0 ? (
          <span
            aria-hidden
            className="absolute end-1.5 top-1.5 size-2 rounded-full bg-accent ring-2 ring-surface"
          />
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="animate-fade absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={d.nav.navigation}
            className="animate-drawer relative flex h-full w-[min(19rem,85vw)] flex-col bg-nav shadow-xl"
          >
            <div className="flex h-16 shrink-0 items-center justify-between ps-3 pe-2">
              <span className="flex min-w-0 items-center">
                <span className="min-w-0">
                  <Logo height={30} title="SM Academy" />
                  <span className="mt-1 block truncate text-[11px] font-medium leading-tight text-nav-ink-faint">
                    {d.roles[props.role]}
                  </span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={d.nav.closeNavigation}
                className="inline-flex size-9 items-center justify-center rounded-md text-nav-ink-soft transition-colors hover:bg-nav-raised hover:text-nav-ink"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <nav
              aria-label={d.nav.main}
              className="scroll-slim flex-1 overflow-y-auto px-3 pb-4"
            >
              {NAV_GROUPS.map((group) => {
                const groupItems = items.filter((item) => item.group === group);
                if (!groupItems.length) return null;
                return (
                  <div key={group} className="mb-5 last:mb-0">
                    <p className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-nav-ink-faint">
                      {group}
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {groupItems.map((item) => (
                        <li key={item.href}>
                          <NavLink
                            item={item}
                            pathname={pathname}
                            showLabel
                            badge={
                              item.href === "/notifications" ? props.unread : 0
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </nav>

            <hr className="mx-3 border-nav-rule" />
            <div className="p-3">
              <Link
                href="/account"
                className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-nav-raised"
              >
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-nav-raised text-[11px] font-semibold text-nav-ink"
                >
                  {initials(props.fullName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium leading-tight text-nav-ink">
                    {props.fullName}
                  </span>
                  <span className="tabular block truncate text-[11px] leading-tight text-nav-ink-faint">
                    {props.publicId}
                  </span>
                </span>
                <Icon name="chevron-right" size={14} className="text-nav-ink-faint" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
