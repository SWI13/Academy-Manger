import { redirect } from "next/navigation";

import { Avatar } from "@/components/ui/Avatar";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/format";
import type { RoleCode } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import { getDict } from "@/lib/i18n.server";

import { ChangePassword } from "./ChangePassword";
import { PermissionList } from "./PermissionList";

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.nav.account };
}

/**
 * Your own record, and the one thing you can change about it.
 *
 * Everything here comes from the session the shell already fetched - there is
 * no second endpoint and no second copy. Contact details are read-only on
 * purpose: correcting a phone number is reception's job, and a form here
 * would be a second path into the same field with none of the audit that the
 * people screen carries.
 *
 * The permission list is the honest answer to "what am I allowed to do",
 * which people otherwise work out by clicking around and being refused.
 */
export default async function AccountPage() {
  const d = await getDict();
  const session = await getSession();
  if (!session) redirect("/login");

  const extraRoles = session.roles.filter(
    (code) => code !== session.primary_role,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={d.nav.account}
        lede={d.account.lede}
      />

      <Card>
        <div className="flex flex-wrap items-start gap-5">
          <Avatar
            name={session.full_name}
            seed={session.public_id}
            size="xl"
            className="ring-4 ring-sunk"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="text-xl font-semibold text-ink">
                {session.full_name}
              </h2>
              <StatusBadge status={session.status} />
            </div>
            <p className="tabular mt-1 text-sm text-ink-soft">
              {session.public_id}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="accent" size="sm">
                {d.roles[session.primary_role]} · {d.users.primary}
              </Badge>
              {extraRoles.map((code) => (
                <Badge key={code} tone="info" size="sm">
                  {d.roles[code as RoleCode] ?? code}
                </Badge>
              ))}
            </div>
          </div>
          <LinkButton href={`/users/${session.public_id}`} icon="user">{d.account.fullRecord}</LinkButton>
        </div>

        <div className="mt-6 border-t border-rule pt-5">
          <DescriptionList
            items={[
              {
                label: d.users.phone,
                value: (
                  <span className="tabular">{session.phone || "—"}</span>
                ),
              },
              { label: d.users.email, value: session.email || "—" },
              {
                label: d.account.lastSignedIn,
                value: session.last_login ? (
                  <span className="tabular">
                    {formatDateTime(session.last_login)}
                  </span>
                ) : (
                  <span className="text-ink-faint">this is your first time</span>
                ),
              },
            ]}
            columns={3}
          />
          <p className="mt-4 text-[13px] leading-relaxed text-ink-faint">
            Something wrong here? Ask reception to correct it — changes to a
            person’s record are made in one place, where they are recorded.
          </p>
        </div>
      </Card>

      <ChangePassword />

      <Card>
        <CardHeader
          title={d.account.permissionsTitle}
          icon="shield"
          description={d.account.permissionsNote}
          divider
          className="mb-5"
        />
        <PermissionList permissions={session.permissions} />
      </Card>
    </div>
  );
}
