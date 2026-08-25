import { Icon } from "@/components/ui/Icon";
import type { Permission } from "@/lib/permissions";

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
const GROUPS: { title: string; items: [Permission, string][] }[] = [
  {
    title: "Users & access",
    items: [
      ["user.view", "See people"],
      ["user.create", "Create accounts"],
      ["user.update", "Edit people"],
      ["user.deactivate", "Deactivate accounts"],
      ["user.reset_password", "Reset passwords"],
      ["user.assign_role", "Assign roles"],
      ["role.manage", "Manage roles and permissions"],
    ],
  },
  {
    title: "Catalogue",
    items: [
      ["course.view", "See courses"],
      ["course.create", "Create courses"],
      ["course.update", "Edit courses"],
      ["course.archive", "Archive courses"],
      ["course.assign_professor", "Assign professors"],
      ["schedule.view", "See the schedule"],
      ["schedule.manage", "Manage the schedule"],
    ],
  },
  {
    title: "Enrolment",
    items: [
      ["enrollment.view", "See enrolments"],
      ["enrollment.create", "Enrol students"],
      ["enrollment.update", "Edit enrolments"],
      ["enrollment.cancel", "Cancel enrolments"],
    ],
  },
  {
    title: "Grades",
    items: [
      ["assessment.view", "See assessments"],
      ["assessment.manage", "Create and edit assessments"],
      ["score.view", "See marks"],
      ["score.enter", "Enter and correct marks"],
      ["score.publish", "Publish marks to students"],
    ],
  },
  {
    title: "Money",
    items: [
      ["payment.view", "See payments"],
      ["payment.create", "Record payments"],
      ["payment.approve", "Approve payments"],
      ["payment.reject", "Reject payments"],
      ["payment.cancel", "Cancel pending payments"],
      ["proof.upload", "Attach payment proofs"],
      ["proof.view", "Open payment proofs"],
    ],
  },
  {
    title: "Engagement",
    items: [
      ["review.create", "Write a review"],
      ["review.view", "See reviews"],
      ["review.moderate", "Moderate reviews"],
      ["notification.send", "Send notifications"],
    ],
  },
  {
    title: "Oversight",
    items: [
      ["report.view_operational", "Run operational reports"],
      ["report.view_financial", "Run financial reports"],
      ["report.export", "Export reports"],
      ["audit.view", "Read the audit log"],
      ["settings.manage", "Manage system settings"],
    ],
  },
];

export function PermissionList({
  permissions,
}: {
  permissions: Permission[];
}) {
  const held = new Set<string>(permissions);

  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(([code]) => held.has(code)),
  })).filter((group) => group.items.length);

  // Anything the catalogue grew that this list has not caught up with.
  const known = new Set(GROUPS.flatMap((group) => group.items.map(([code]) => code)));
  const extra = permissions.filter((code) => !known.has(code));

  return (
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="eyebrow">{group.title}</p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {group.items.map(([code, label]) => (
              <li
                key={code}
                className="flex items-start gap-2 text-[13px] text-ink-soft"
              >
                <Icon name="check" size={14} className="mt-0.5 shrink-0 text-ok" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {extra.length ? (
        <div>
          <p className="eyebrow">Also</p>
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
