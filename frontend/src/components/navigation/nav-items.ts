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
  /** Rendered only if the caller holds this. Undefined means everyone. */
  needs?: Permission;
  group: "Work" | "People" | "Oversight";
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", group: "Work" },
  { href: "/courses", label: "Courses", needs: "course.view", group: "Work" },
  {
    href: "/enrollments",
    label: "Enrolments",
    needs: "enrollment.view",
    group: "Work",
  },
  {
    href: "/schedules",
    label: "Schedule",
    needs: "schedule.view",
    group: "Work",
  },
  { href: "/grades", label: "Grades", needs: "score.view", group: "Work" },
  {
    href: "/payments",
    label: "Payments",
    needs: "payment.view",
    group: "Work",
  },
  { href: "/users", label: "People", needs: "user.view", group: "People" },
  { href: "/reviews", label: "Reviews", needs: "review.view", group: "People" },
  {
    href: "/notifications",
    label: "Notifications",
    group: "People",
  },
  {
    href: "/reports",
    label: "Reports",
    needs: "report.view_operational",
    group: "Oversight",
  },
  { href: "/audit", label: "Audit log", needs: "audit.view", group: "Oversight" },
  {
    href: "/settings",
    label: "Settings",
    needs: "settings.manage",
    group: "Oversight",
  },
];

export const NAV_GROUPS = ["Work", "People", "Oversight"] as const;

export function visibleItems(permissions: readonly Permission[]): NavItem[] {
  const held = new Set<string>(permissions);
  return NAV_ITEMS.filter((item) => !item.needs || held.has(item.needs));
}
