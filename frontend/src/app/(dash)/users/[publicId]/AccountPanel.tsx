"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCan, useSession } from "@/components/SessionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, FormError, Note } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { manageableRoles } from "@/lib/manageable";
import type { RoleCode } from "@/lib/permissions";
import type { User } from "@/types";
import { useDict, useFill } from "@/components/LocaleProvider";

type StatusCode = "ACTIVE" | "SUSPENDED" | "INACTIVE";

/**
 * Roles, status and password reset, with the rules said out loud.
 *
 * Three constraints live here, and each is stated rather than left for
 * someone to discover by being refused:
 *
 *   - Only an owner grants roles. An admin manages people but cannot hand out
 *     powers, including to themselves.
 *   - Nobody changes their own status. Otherwise "deactivate" is a button that
 *     locks you out of the system you administer.
 *   - The roles you may hand out are bounded by your own.
 *
 * All three are enforced by Django. Saying them here is what stops the UI
 * feeling arbitrary.
 */
export function AccountPanel({ user }: { user: User }) {
  const d = useDict();
  const t = useFill();
  const router = useRouter();
  const can = useCan();
  const session = useSession();
  const toast = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [temporary, setTemporary] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState<StatusCode | null>(null);
  const [resetting, setResetting] = useState(false);

  const isSelf = user.public_id === session.public_id;
  const mayAssignRoles = can("user.assign_role");
  const mayChangeStatus = can("user.deactivate") && !isSelf;
  const mayReset = can("user.reset_password");
  const grantable = manageableRoles(can);

  async function call(label: string, run: () => Promise<unknown>, done?: string) {
    setBusy(label);
    setError(null);
    try {
      await run();
      if (done) toast({ tone: "ok", title: done });
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof ApiFailure
          ? failure.message
          : d.ui.serverUnreachable,
      );
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(status: StatusCode) {
    await call(
      status,
      () =>
        api.post(`/users/${user.public_id}/status`, {
          status,
          reason,
        }),
      status === "ACTIVE"
        ? d.users.reactivated
        : status === "SUSPENDED"
          ? d.users.suspended
          : d.users.deactivated,
    );
    setAsking(null);
    setReason("");
  }

  async function resetPassword() {
    setBusy("reset");
    setError(null);
    setTemporary(null);
    try {
      const result = await api.post<{ temporary_password: string }>(
        "/auth/password/reset",
        { public_id: user.public_id },
      );
      setTemporary(result.temporary_password);
      setResetting(false);
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof ApiFailure
          ? failure.message
          : d.ui.serverUnreachable,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* --- roles ---------------------------------------------------- */}
      <Card>
        <CardHeader
          title={d.users.roles}
          icon="shield"
          description={d.users.rolesNote}
          divider
          className="mb-4"
        />

        <div className="flex flex-wrap gap-2">
          {user.roles.length ? (
            user.roles.map((code) => (
              <Badge
                key={code}
                tone={code === user.primary_role ? "accent" : "neutral"}
              >
                {d.roles[code as RoleCode] ?? code}
                {code === user.primary_role ? " · primary" : ""}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-ink-faint">None</span>
          )}
        </div>

        {isSelf ? (
          <p className="mt-4 border-t border-rule pt-4 text-[13px] leading-relaxed text-ink-faint">
            Nobody changes their own roles, the owner included. Self-escalation
            is exactly what that rule closes.
          </p>
        ) : mayAssignRoles ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-4">
            {grantable
              .filter((code) => !user.roles.includes(code))
              .map((code) => (
                <Button
                  key={code}
                  size="sm"
                  icon="plus"
                  busy={busy === `grant-${code}`}
                  onClick={() =>
                    call(
                      `grant-${code}`,
                      () =>
                        api.post(`/users/${user.public_id}/roles`, {
                          role: code,
                        }),
                      t(d.users.roleGranted, { role: d.roles[code] }),
                    )
                  }
                >
                  {t(d.users.grantRole, { role: d.roles[code] })}
                </Button>
              ))}
            {user.roles.length > 1
              ? user.roles
                  .filter((code) => code !== user.primary_role)
                  .map((code) => (
                    <Button
                      key={`revoke-${code}`}
                      size="sm"
                      variant="danger"
                      icon="minus"
                      busy={busy === `revoke-${code}`}
                      onClick={() =>
                        call(
                          `revoke-${code}`,
                          () =>
                            api.delete(`/users/${user.public_id}/roles`, {
                              role: code,
                            }),
                          `${d.roles[code as RoleCode] ?? code} revoked`,
                        )
                      }
                    >
                      Revoke {d.roles[code as RoleCode] ?? code}
                    </Button>
                  ))
              : null}
          </div>
        ) : (
          <p className="mt-4 border-t border-rule pt-4 text-[13px] leading-relaxed text-ink-faint">
            Only the owner grants and revokes roles — an administrator manages
            people but cannot hand out powers, including to themselves.
          </p>
        )}
      </Card>

      {/* --- status --------------------------------------------------- */}
      <Card>
        <CardHeader
          title={d.users.accountStatus}
          icon="lock"
          description={d.users.accountStatusNote}
          divider
          className="mb-4"
        />

        {isSelf ? (
          <Note tone="neutral">
            This is your own account. Nobody changes their own status — a
            deactivate button here would be a way to lock yourself out of the
            system you administer.
          </Note>
        ) : mayChangeStatus ? (
          <>
            <div className="flex flex-wrap gap-2">
              {user.status !== "ACTIVE" ? (
                <Button
                  variant="primary"
                  icon="check"
                  onClick={() => setAsking("ACTIVE")}
                >{d.users.reactivate}</Button>
              ) : null}
              {user.status !== "SUSPENDED" ? (
                <Button icon="clock" onClick={() => setAsking("SUSPENDED")}>{d.users.suspend}</Button>
              ) : null}
              {user.status !== "INACTIVE" ? (
                <Button
                  variant="danger"
                  icon="close"
                  onClick={() => setAsking("INACTIVE")}
                >{d.users.deactivate}</Button>
              ) : null}
            </div>

            <p className="mt-4 text-xs leading-relaxed text-ink-faint">
              Deactivating takes effect on their very next request — the session
              lives on the server, not in a token that has to expire.
            </p>
          </>
        ) : (
          <Note tone="neutral">{d.users.cannotChangeStatus}</Note>
        )}
      </Card>

      {/* --- password ------------------------------------------------- */}
      {mayReset && !isSelf ? (
        <Card>
          <CardHeader title={d.account.password} icon="key" divider className="mb-4" />

          {temporary ? (
            <div className="rounded-lg border border-warn-line bg-warn-wash p-3.5">
              <p className="flex items-center gap-2 text-sm font-medium text-warn">
                <Icon name="alert" size={16} />{d.users.newPasswordOnce}</p>
              <p className="tabular mt-3 select-all break-all rounded-md border border-warn-line bg-black/40 px-3 py-2.5 font-mono text-base text-ink">
                {temporary}
              </p>
              <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">
                Their existing sessions are already invalid — a reset locks out
                whoever was using the account, which is the point of a reset.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink-soft">
                Issues a temporary password, shown once. Nobody can read their
                old one — it was never stored in a readable form.
              </p>
              <Button
                className="mt-4"
                icon="key"
                busy={busy === "reset"}
                onClick={() => setResetting(true)}
              >{d.users.resetPassword}</Button>
            </>
          )}
        </Card>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      {/* --- confirmations -------------------------------------------- */}
      <ConfirmDialog
        open={asking !== null}
        onClose={() => {
          setAsking(null);
          setReason("");
        }}
        onConfirm={() => asking && changeStatus(asking)}
        busy={busy === asking}
        tone={asking === "ACTIVE" ? "primary" : "danger"}
        icon={asking === "ACTIVE" ? "check" : "alert"}
        title={
          asking === "ACTIVE"
            ? `Reactivate ${user.full_name}?`
            : asking === "SUSPENDED"
              ? `Suspend ${user.full_name}?`
              : `Deactivate ${user.full_name}?`
        }
        confirmLabel={
          asking === "ACTIVE"
            ? d.users.reactivate
            : asking === "SUSPENDED"
              ? d.users.suspend
              : d.users.deactivate
        }
        description={
          asking === "ACTIVE"
            ? d.users.reactivatedNote
            : d.users.deactivatedNote
        }
      >
        <Field
          label={d.users.reason}
          optional
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={d.users.reasonPlaceholder}
          hint={d.users.reasonNote}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        onConfirm={resetPassword}
        busy={busy === "reset"}
        tone="danger"
        icon="key"
        title={d.users.resetPasswordTitle}
        confirmLabel={d.users.resetPassword}
        description={d.users.resetPasswordNote}
      >
        <Note tone="warn">
          Only do this with them in front of you or on the phone. The temporary
          password appears once and cannot be retrieved afterwards.
        </Note>
      </ConfirmDialog>
    </div>
  );
}
