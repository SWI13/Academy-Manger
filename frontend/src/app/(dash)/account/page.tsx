import { redirect } from "next/navigation";

import { Avatar } from "@/components/ui/Avatar";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS, type RoleCode } from "@/lib/permissions";
import { getSession } from "@/lib/session";

import { ChangePassword } from "./ChangePassword";
import { PermissionList } from "./PermissionList";

export const metadata = { title: "Your account · SM Academy" };

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
  const session = await getSession();
  if (!session) redirect("/login");

  const extraRoles = session.roles.filter(
    (code) => code !== session.primary_role,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your account"
        lede="What we hold about you, and what your role lets you reach."
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
                {ROLE_LABELS[session.primary_role]} · primary
              </Badge>
              {extraRoles.map((code) => (
                <Badge key={code} tone="info" size="sm">
                  {ROLE_LABELS[code as RoleCode] ?? code}
                </Badge>
              ))}
            </div>
          </div>
          <LinkButton href={`/users/${session.public_id}`} icon="user">
            Full record
          </LinkButton>
        </div>

        <div className="mt-6 border-t border-rule pt-5">
          <DescriptionList
            items={[
              {
                label: "Phone",
                value: (
                  <span className="tabular">{session.phone || "—"}</span>
                ),
              },
              { label: "Email", value: session.email || "—" },
              {
                label: "Last signed in",
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
          title="What your role allows"
          icon="shield"
          description="Granted by permission, not by job title. The server checks every one of these on every request."
          divider
          className="mb-5"
        />
        <PermissionList permissions={session.permissions} />
      </Card>
    </div>
  );
}
