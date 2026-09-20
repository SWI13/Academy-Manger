import { Icon } from "@/components/ui/Icon";
import type { Dict } from "@/lib/dict/en";
import type { Permission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n.server";

/**
 * What this account may do, in the words a person would use.
 *
 * The labels mirror `apps/rbac/catalog.py`, which is where the codenames and
 * their human names both live. A codename with no label here still renders -
 * as its codename - rather than disappearing, because a permission the screen
 * has not been taught about is exactly the one worth seeing.
 *
 * This is a description of the session, not a control over it. Granting and
 * revoking happen on a person's own page and only for an owner.
 */
const GROUPS: { title: keyof Dict["perms"]; items: Permission[] }[] = [
  {
    title: "groupUsers",
    items: [
      "user.view",
      "user.create",
      "user.update",
      "user.deactivate",
      "user.reset_password",
      "user.assign_role",
      "role.manage",
    ],
  },
  {
    title: "groupCatalogue",
    items: [
      "course.view",
      "course.create",
      "course.update",
      "course.archive",
      "course.assign_professor",
      "schedule.view",
      "schedule.manage",
    ],
  },
  {
    title: "groupEnrollment",
    items: [
      "enrollment.view",
      "enrollment.create",
      "enrollment.update",
      "enrollment.cancel",
      "assessment.view",
      "assessment.manage",
      "score.view",
      "score.enter",
      "score.publish",
    ],
  },
  {
    title: "groupAttendance",
    items: ["attendance.view", "attendance.record"],
  },
  {
    title: "groupMoney",
    items: [
      "payment.view",
      "payment.create",
      "payment.approve",
      "payment.reject",
      "payment.cancel",
      "proof.upload",
      "proof.view",
    ],
  },
  {
    title: "groupLogistics",
    items: [
      "logistics.view",
      "logistics.manage",
      "expense.view",
      "expense.manage",
    ],
  },
  {
    title: "groupEngagement",
    items: [
      "review.create",
      "review.view",
      "review.moderate",
      "notification.send",
    ],
  },
  {
    title: "groupOversight",
    items: [
      "report.view_operational",
      "report.view_financial",
      "report.export",
      "audit.view",
      "settings.manage",
    ],
  },
];

export async function PermissionList({
  permissions,
}: {
  permissions: Permission[];
}) {
  const d = await getDict();
  const held = new Set<string>(permissions);

  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((code) => held.has(code)),
  })).filter((group) => group.items.length);

  // Anything the catalogue grew that this list has not caught up with.
  const known = new Set(GROUPS.flatMap((group) => group.items));
  const extra = permissions.filter((code) => !known.has(code));

  return (
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="eyebrow">{d.perms[group.title]}</p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {group.items.map((code) => (
              <li
                key={code}
                className="flex items-start gap-2 text-[13px] text-ink-soft"
              >
                <Icon name="check" size={14} className="mt-0.5 shrink-0 text-ok" />
                {d.perms[code] ?? code}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {extra.length ? (
        <div>
          <p className="eyebrow">{d.common.more}</p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {extra.map((code) => (
              <li
                key={code}
                className="tabular flex items-start gap-2 text-[13px] text-ink-soft"
              >
                <Icon name="check" size={14} className="mt-0.5 shrink-0 text-ok" />
                {code}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
