import type { IconName } from "@/components/ui/Icon";
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
  label: string;
  icon: IconName;
  /** Rendered only if the caller holds this. Undefined means everyone. */
  needs?: Permission;
  group: NavGroup;
};

export type NavGroup = "Work" | "People" | "Oversight";

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "gauge", group: "Work" },
  {
    href: "/courses",
    label: "Courses",
    icon: "book",
    needs: "course.view",
    group: "Work",
  },
  {
    href: "/enrollments",
    label: "Enrolments",
    icon: "graduation",
    needs: "enrollment.view",
    group: "Work",
  },
  {
    href: "/schedules",
    label: "Schedule",
    icon: "calendar",
    needs: "schedule.view",
    group: "Work",
  },
  {
    href: "/grades",
    label: "Grades",
    icon: "check-circle",
    needs: "score.view",
    group: "Work",
  },
  {
    href: "/payments",
    label: "Payments",
    icon: "wallet",
    needs: "payment.view",
    group: "Work",
  },
  {
    href: "/users",
    label: "People",
    icon: "users",
    needs: "user.view",
    group: "People",
  },
  {
    href: "/reviews",
    label: "Reviews",
    icon: "star",
    needs: "review.view",
    group: "People",
  },
  {
    href: "/notifications",
    label: "Notifications",
    icon: "bell",
    group: "People",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "activity",
    needs: "report.view_operational",
    group: "Oversight",
  },
  {
    href: "/audit",
    label: "Audit log",
    icon: "shield",
    needs: "audit.view",
    group: "Oversight",
  },
];

export const NAV_GROUPS: NavGroup[] = ["Work", "People", "Oversight"];

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
