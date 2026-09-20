import type { IconName } from "@/components/ui/Icon";
import type { Dict } from "@/lib/dict/en";
import type { Permission } from "@/lib/permissions";

/**
 * The navigation, as data.
 *
 * Each item names the permission it needs, and the sidebar renders the ones
 * the caller holds. Not a switch on role: grant reception `audit.view`
 * tomorrow and the Audit link appears with no code change, which is the whole
 * point of the permissions being data in the first place.
 *
 * This is presentation only. Hiding a link is not what stops anyone reaching
 * the page behind it - Django refuses that, and the link being absent just
 * means nobody is invited to try.
 */

export type NavItem = {
  href: string;
  /**
   * A key into `dict.nav`, not a label.
   *
   * The rail is rendered in whichever of three languages the reader chose, so
   * an English string here would be an English word in an Arabic sidebar.
   * Typed against the dictionary, so a key that does not exist will not
   * compile.
   */
  key: keyof Dict["nav"];
  icon: IconName;
  /** Rendered only if the caller holds this. Undefined means everyone. */
  needs?: Permission;
  group: NavGroup;
};

export type NavGroup = "work" | "people" | "oversight";

/** The group headings, as keys into `dict.nav`. */
export const GROUP_KEYS: Record<NavGroup, keyof Dict["nav"]> = {
  work: "groupWork",
  people: "groupPeople",
  oversight: "groupOversight",
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", key: "dashboard", icon: "gauge", group: "work" },
  {
    href: "/courses",
    key: "courses",
    icon: "book",
    needs: "course.view",
    group: "work",
  },
  {
    href: "/enrollments",
    key: "enrollments",
    icon: "graduation",
    needs: "enrollment.view",
    group: "work",
  },
  {
    href: "/schedules",
    key: "schedules",
    icon: "calendar",
    needs: "schedule.view",
    group: "work",
  },
  {
    href: "/grades",
    key: "grades",
    icon: "check-circle",
    needs: "score.view",
    group: "work",
  },
  {
    href: "/attendance",
    key: "attendance",
    icon: "clipboard",
    needs: "attendance.view",
    group: "work",
  },
  {
    href: "/payments",
    key: "payments",
    icon: "wallet",
    needs: "payment.view",
    group: "work",
  },
  {
    // One entry for a section with four screens. Inventory, expenses, history
    // and setup are tabs within it rather than four rails: `currentItem`
    // matches on prefix, so every one of them still lights this link up.
    href: "/logistics",
    key: "logistics",
    icon: "layers",
    needs: "logistics.view",
    group: "work",
  },
  {
    href: "/users",
    key: "users",
    icon: "users",
    needs: "user.view",
    group: "people",
  },
  {
    href: "/reviews",
    key: "reviews",
    icon: "star",
    needs: "review.view",
    group: "people",
  },
  {
    href: "/notifications",
    key: "notifications",
    icon: "bell",
    group: "people",
  },
  {
    href: "/reports",
    key: "reports",
    icon: "activity",
    needs: "report.view_operational",
    group: "oversight",
  },
  {
    href: "/audit",
    key: "audit",
    icon: "shield",
    needs: "audit.view",
    group: "oversight",
  },
  {
    // The institute's own details, which open every printed document. Offered
    // to whoever may change them; everybody else reads them on the paper.
    href: "/settings",
    key: "settings",
    icon: "settings",
    needs: "settings.manage",
    group: "oversight",
  },
];

export const NAV_GROUPS: NavGroup[] = ["work", "people", "oversight"];

export function visibleItems(permissions: readonly Permission[]): NavItem[] {
  const held = new Set<string>(permissions);
  return NAV_ITEMS.filter((item) => !item.needs || held.has(item.needs));
}

/**
 * The item whose page is being shown, for the name in the top bar.
 *
 * Filtered by the caller's permissions for the same reason the sidebar is:
 * naming a section somebody cannot reach tells them it exists, which is a
 * small thing to leak and free not to.
 */
export function currentItem(
  pathname: string,
  permissions: readonly Permission[],
): NavItem | undefined {
  return visibleItems(permissions)
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
}
