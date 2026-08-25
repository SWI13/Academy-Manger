"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/ui/Badge";
import type { Column } from "@/components/ui/DataTable";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS, type Permission, type RoleCode } from "@/lib/permissions";
import type { User } from "@/types";

/**
 * The people list.
 *
 * `roles` and `primary_role` are different things and the column shows both
 * when they disagree. Primary role is a routing hint - which dashboard you
 * land on - while the roles array is what actually grants anything. Someone
 * who is a professor and also takes a class holds two, and a list that showed
 * only the hint would quietly misdescribe them.
 */
export function userColumns(
  can: (permission: Permission) => boolean,
): Column<User>[] {
  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Name",
      cell: (user) => (
        <Link
          href={`/users/${user.public_id}`}
          className="text-accent hover:underline"
        >
          <span className="block font-medium">{user.full_name}</span>
          <span className="tabular block text-xs text-ink-faint">
            {user.public_id}
          </span>
        </Link>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (user) => {
        const extra = user.roles.filter((code) => code !== user.primary_role);
        return (
          <div>
            <p className="text-ink">
              {ROLE_LABELS[user.primary_role as RoleCode] ?? user.primary_role}
            </p>
            {extra.length ? (
              <p className="text-xs text-ink-faint">
                also {extra.map((code) => ROLE_LABELS[code as RoleCode] ?? code).join(", ")}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "contact",
      header: "Contact",
      secondary: true,
      cell: (user) => (
        <div className="text-ink-soft">
          <p className="tabular">{user.phone || "—"}</p>
          {user.email ? <p className="text-xs">{user.email}</p> : null}
        </div>
      ),
    },
  ];

  // When someone was last here is a staff question, not something to put on
  // every screen that happens to list people.
  if (can("user.deactivate")) {
    columns.push({
      key: "last_login",
      header: "Last seen",
      secondary: true,
      cell: (user) =>
        user.last_login ? (
          formatDate(user.last_login)
        ) : (
          <span className="text-ink-faint">never signed in</span>
        ),
    });
  }

  columns.push({
    key: "status",
    header: "Status",
    cell: (user) => <StatusBadge status={user.status} />,
  });

  return columns;
}
