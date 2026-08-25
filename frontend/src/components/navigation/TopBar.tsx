"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import type { Permission, RoleCode } from "@/lib/permissions";

import { MobileNav } from "./Sidebar";
import { UserMenu } from "./UserMenu";
import { currentItem } from "./nav-items";

/**
 * The bar over the workspace.
 *
 * It holds what belongs to the person rather than to the page: where they
 * are, whether anything is waiting for them, and who they are signed in as.
 * Deliberately no global search box - there is no endpoint that searches
 * across courses, people and payments at once, and a search field that only
 * works on some pages is worse than none.
 *
 * The unread count is rendered from a figure the server already fetched for
 * this render. No polling: a bell that asks the API every thirty seconds on
 * every open tab is a lot of traffic to tell most people nothing changed.
 */
export function TopBar({
  fullName,
  publicId,
  role,
  permissions,
  unread,
}: {
  fullName: string;
  publicId: string;
  role: RoleCode;
  permissions: Permission[];
  unread: number;
}) {
  const pathname = usePathname();
  // Named from the caller's own navigation, so a URL their role does not
  // include is not labelled with the section behind it on the way to being
  // refused.
  const here = currentItem(pathname, permissions);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-rule bg-paper/85 px-4 backdrop-blur-md sm:px-6">
      <MobileNav
        permissions={permissions}
        role={role}
        fullName={fullName}
        publicId={publicId}
        unread={unread}
      />

      {/*
        The section name, not a full breadcrumb trail. Two levels of crumbs on
        a three-level application is furniture; the page's own header carries
        the record's name and its own way back.
      */}
      <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
        {here ? (
          <>
            <Icon
              name={here.icon}
              size={16}
              className="hidden text-ink-faint sm:block"
            />
            <span className="truncate">{here.label}</span>
          </>
        ) : null}
      </p>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Link
          href="/notifications"
          aria-label={
            unread ? `Notifications, ${unread} unread` : "Notifications"
          }
          className="relative inline-flex size-9 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-sunk hover:text-ink"
        >
          <Icon name="bell" size={18} />
          {unread > 0 ? (
            <span
              aria-hidden
              className="tabular absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink ring-2 ring-paper"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Link>

        <span aria-hidden className="mx-1 hidden h-6 w-px bg-rule sm:block" />

        <UserMenu fullName={fullName} publicId={publicId} role={role} />
      </div>
    </header>
  );
}
