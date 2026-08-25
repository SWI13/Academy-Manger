import Link from "next/link";

import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { manageableRoles } from "@/lib/manageable";
import { ROLE_LABELS } from "@/lib/permissions";
import { can, getSession } from "@/lib/session";
import type { User } from "@/types";

import { UsersTable } from "./UsersTable";

export const metadata = { title: "People · SM Academy" };

const FILTERS = ["q", "role", "status"];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [page, session] = await Promise.all([
    fetchPage<User>("users", params, FILTERS),
    getSession(),
  ]);

  if (!page) {
    return (
      <p className="text-sm text-ink-soft">
        People could not be loaded. Try refreshing.
      </p>
    );
  }

  const roles = manageableRoles((permission) => can(session, permission));
  const mayCreate = can(session, "user.create");

  // A student holds user.view scoped to themselves, so this page is their own
  // record and a "filter by role" box would be furniture.
  const seesOthers = can(session, "user.create") || can(session, "user.deactivate");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {seesOthers ? "People" : "Your account"}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {seesOthers
              ? "Accounts are deactivated, never deleted — enrolments, payments and marks have to stay attributable to someone."
              : "The details we hold for you. Ask reception to correct anything that is wrong."}
          </p>
        </div>
        {mayCreate ? (
          <Link
            href="/users/new"
            className="rounded border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90"
          >
            New person
          </Link>
        ) : null}
      </header>

      {seesOthers ? (
        <Toolbar
          filters={[
            { param: "q", label: "Search", placeholder: "Name, ID or phone" },
            {
              param: "role",
              label: "Role",
              // Only the roles this caller can reach at all. An admin
              // filtering for owners would always get an empty page, because
              // owner accounts are outside their scoped queryset entirely.
              options: roles.map((code) => ({
                value: code,
                label: ROLE_LABELS[code],
              })),
            },
            {
              param: "status",
              label: "Status",
              options: [
                { value: "ACTIVE", label: "Active" },
                { value: "INACTIVE", label: "Inactive" },
                { value: "SUSPENDED", label: "Suspended" },
              ],
            },
          ]}
        />
      ) : null}

      <UsersTable rows={page.results} />

      <Pagination
        count={page.count}
        page={pageFrom(params)}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
