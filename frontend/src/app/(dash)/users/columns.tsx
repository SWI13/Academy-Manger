"use client";

import Link from "next/link";

import { PersonCell } from "@/components/ui/Avatar";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import type { Column } from "@/components/ui/DataTable";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS, type Permission, type RoleCode } from "@/lib/permissions";
import type { User } from "@/types";

/**
 * The people list.
 *
 * `primary_role` and `roles` are different things, and the column shows both
 * when they disagree. Primary role is a routing hint - which dashboard you
 * land on - while the roles array is what actually grants anything. Someone
 * who teaches and also takes a class holds two, and a list showing only the
 * hint would quietly misdescribe them.
 */
export function userColumns(
  can: (permission: Permission) => boolean,
): Column<User>[] {
  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Name",
      lead: true,
      cell: (user) => (
        <Link href={`/users/${user.public_id}`} className="block min-w-0">
          <PersonCell name={user.full_name} publicId={user.public_id} />
        </Link>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (user) => {
        const extra = user.roles.filter((code) => code !== user.primary_role);
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral" size="sm">
              {ROLE_LABELS[user.primary_role as RoleCode] ?? user.primary_role}
            </Badge>
            {extra.map((code) => (
              <Badge key={code} tone="info" size="sm">
                {ROLE_LABELS[code as RoleCode] ?? code}
              </Badge>
            ))}
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
          {user.email ? (
            <p className="truncate text-xs text-ink-faint">{user.email}</p>
          ) : null}
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
          <span className="tabular whitespace-nowrap text-ink-soft">
            {formatDate(user.last_login)}
          </span>
        ) : (
          <span className="text-ink-faint">never signed in</span>
        ),
    });
  }

  columns.push({
    key: "status",
    header: "Status",
    trail: true,
    width: "1%",
    cell: (user) => <StatusBadge status={user.status} />,
  });

  return columns;
}
