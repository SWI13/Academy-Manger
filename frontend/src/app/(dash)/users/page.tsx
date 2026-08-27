import { LinkButton } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { manageableRoles } from "@/lib/manageable";
import { ROLE_LABELS } from "@/lib/permissions";
import { can, getSession } from "@/lib/session";
import type { User } from "@/types";

import { UsersTable } from "./UsersTable";

export const metadata = { title: "People" };

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
    return <ErrorState title="People could not be loaded" />;
  }

  const roles = manageableRoles((permission) => can(session, permission));
  const mayCreate = can(session, "user.create");

  // A student holds user.view scoped to themselves, so this page is their own
  // record and a "filter by role" box would be furniture.
  const seesOthers =
    can(session, "user.create") || can(session, "user.deactivate");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={seesOthers ? "People" : "Your account"}
        lede={
          seesOthers
            ? "Accounts are deactivated, never deleted — enrolments, payments and marks have to stay attributable to someone."
            : "The details we hold for you. Ask reception to correct anything that is wrong."
        }
        actions={
          mayCreate ? (
            <LinkButton href="/users/new" variant="primary" icon="user-plus">
              New person
            </LinkButton>
          ) : null
        }
      />

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
        unit="person"
        plural="people"
      />
    </div>
  );
}
