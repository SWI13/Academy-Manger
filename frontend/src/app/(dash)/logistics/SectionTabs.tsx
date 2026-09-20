"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useDict } from "@/components/LocaleProvider";
import { useCan } from "@/components/SessionProvider";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * The four screens of one section, as links.
 *
 * Not `ui/Tabs`: that component moves a `?tab=` parameter on the current
 * path, and these are four different paths with four different sets of
 * filters in their own query strings. Sending somebody from a filtered
 * inventory to the expenses screen must not carry `condition=DAMAGED` along
 * with them.
 *
 * Setup only appears for whoever can change something on it. Reception sees
 * three tabs, and the one it does not see is the one where every control
 * would be disabled.
 */
type Section = {
  href: string;
  label: string;
  icon: IconName;
  /** Longest-prefix wins, so /logistics/expenses/history is History, not Expenses. */
  match: (pathname: string) => boolean;
};

export function SectionTabs() {
  const d = useDict();
  const can = useCan();
  const pathname = usePathname();

  const sections: Section[] = [
    {
      href: "/logistics",
      label: d.logistics.inventory,
      icon: "layers",
      match: (path) =>
        path === "/logistics" ||
        (path.startsWith("/logistics/") &&
          !path.startsWith("/logistics/expenses") &&
          !path.startsWith("/logistics/setup")),
    },
    {
      href: "/logistics/expenses",
      label: d.logistics.expensesTab,
      icon: "receipt",
      match: (path) =>
        path.startsWith("/logistics/expenses") &&
        !path.startsWith("/logistics/expenses/history"),
    },
    {
      href: "/logistics/expenses/history",
      label: d.logistics.historyTab,
      icon: "clock",
      match: (path) => path.startsWith("/logistics/expenses/history"),
    },
  ];

  if (can("logistics.manage")) {
    sections.push({
      href: "/logistics/setup",
      label: d.logistics.setupTab,
      icon: "settings",
      match: (path) => path.startsWith("/logistics/setup"),
    });
  }

  return (
    <nav
      aria-label={d.logistics.title}
      className="scroll-slim -mx-1 flex gap-1 overflow-x-auto border-b border-rule px-1"
    >
      {sections.map((section) => {
        const selected = section.match(pathname);
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={selected ? "page" : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              selected
                ? "border-accent text-accent [text-shadow:0_0_18px_rgb(237_28_36/0.55)]"
                : "border-transparent text-ink-soft hover:border-rule-strong hover:text-ink"
            }`}
          >
            <Icon name={section.icon} size={15} />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
