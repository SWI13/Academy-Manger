import { LinkButton } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrintButton } from "@/components/ui/PrintButton";
import { Pagination } from "@/components/ui/Pagination";
import { Toolbar } from "@/components/ui/Toolbar";
import { PAGE_SIZE, fetchPage, pageFrom, type SearchParams } from "@/lib/list";
import { manageableRoles } from "@/lib/manageable";
import { can, getSession } from "@/lib/session";
import type { User } from "@/types";
import { getDict } from "@/lib/i18n.server";

import { UsersTable } from "./UsersTable";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.nav.users };
}

const FILTERS = ["q", "role", "status"];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const d = await getDict();
  const params = await searchParams;
  const [page, session] = await Promise.all([
    fetchPage<User>("users", params, FILTERS),
    getSession(),
  ]);

  if (!page) {
    return <ErrorState title={d.users.errorTitle} />;
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
        title={seesOthers ? d.nav.users : d.nav.account}
        lede={
          seesOthers
            ? d.users.lede
            : d.users.ledeSelf
        }
        actions={
          <>
            <PrintButton
              href="/print/students"
              params={params}
              filters={["q", "role", "status"]}
            />
            {mayCreate ? (
              <LinkButton href="/users/new" variant="primary" icon="user-plus">
                {d.users.newPerson}
              </LinkButton>
            ) : null}
          </>
        }
      />

      {seesOthers ? (
        <Toolbar
          filters={[
            { param: "q", label: d.filters.search, placeholder: d.users.searchPlaceholder },
            {
              param: "role",
              label: d.filters.role,
              // Only the roles this caller can reach at all. An admin
              // filtering for owners would always get an empty page, because
              // owner accounts are outside their scoped queryset entirely.
              options: roles.map((code) => ({
                value: code,
                label: d.roles[code],
              })),
            },
            {
              param: "status",
              label: d.filters.status,
              options: [
                { value: "ACTIVE", label: d.status.ACTIVE },
                { value: "INACTIVE", label: d.status.INACTIVE },
                { value: "SUSPENDED", label: d.status.SUSPENDED },
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
        unit={d.units.people}
      />
    </div>
  );
}
