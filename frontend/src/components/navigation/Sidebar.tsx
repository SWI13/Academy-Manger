"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Permission } from "@/lib/permissions";

import { NAV_GROUPS, visibleItems } from "./nav-items";

export function Sidebar({ permissions }: { permissions: Permission[] }) {
  const pathname = usePathname();
  const items = visibleItems(permissions);

  return (
    <nav aria-label="Main" className="flex flex-col gap-6 p-4">
      {NAV_GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (!groupItems.length) return null;

        return (
          <div key={group}>
            <p className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {group}
            </p>
            <ul className="flex flex-col gap-0.5">
              {groupItems.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded px-2 py-1.5 text-sm transition-colors ${
                        active
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-ink-soft hover:bg-sunk hover:text-ink"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
