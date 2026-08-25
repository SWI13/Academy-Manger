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
import { ROLE_LABELS, type RoleCode } from "@/lib/permissions";
import type { User } from "@/types";

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
          : "Could not reach the server.",
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
        ? "Account reactivated"
        : status === "SUSPENDED"
          ? "Account suspended"
          : "Account deactivated",
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
          : "Could not reach the server.",
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
          title="Roles"
          icon="shield"
          description="A role is a set of permissions, not a label. The primary one decides which dashboard they land on."
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
                {ROLE_LABELS[code as RoleCode] ?? code}
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
                      `${ROLE_LABELS[code]} granted`,
                    )
                  }
                >
                  Grant {ROLE_LABELS[code]}
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
                          `${ROLE_LABELS[code as RoleCode] ?? code} revoked`,
                        )
                      }
                    >
                      Revoke {ROLE_LABELS[code as RoleCode] ?? code}
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
          title="Account status"
          icon="lock"
          description="Accounts are deactivated, never deleted — their enrolments, payments and marks stay attributable."
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
                >
                  Reactivate
                </Button>
              ) : null}
              {user.status !== "SUSPENDED" ? (
                <Button icon="clock" onClick={() => setAsking("SUSPENDED")}>
                  Suspend
                </Button>
              ) : null}
              {user.status !== "INACTIVE" ? (
                <Button
                  variant="danger"
                  icon="close"
                  onClick={() => setAsking("INACTIVE")}
                >
                  Deactivate
                </Button>
              ) : null}
            </div>

            <p className="mt-4 text-xs leading-relaxed text-ink-faint">
              Deactivating takes effect on their very next request — the session
              lives on the server, not in a token that has to expire.
            </p>
          </>
        ) : (
          <Note tone="neutral">
            Your role cannot change this account’s status.
          </Note>
        )}
      </Card>

      {/* --- password ------------------------------------------------- */}
      {mayReset && !isSelf ? (
        <Card>
          <CardHeader title="Password" icon="key" divider className="mb-4" />

          {temporary ? (
            <div className="rounded-lg border border-warn-line bg-warn-wash p-3.5">
              <p className="flex items-center gap-2 text-sm font-medium text-warn">
                <Icon name="alert" size={16} />
                Give this to them now. It is not shown again.
              </p>
              <p className="tabular mt-3 select-all break-all rounded-md border border-warn-line bg-surface px-3 py-2.5 font-mono text-base text-ink">
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
              >
                Reset password
              </Button>
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
            ? "Reactivate"
            : asking === "SUSPENDED"
              ? "Suspend"
              : "Deactivate"
        }
        description={
          asking === "ACTIVE"
            ? "They will be able to sign in again."
            : "They are signed out on their next request and cannot sign back in. Their records stay exactly where they are."
        }
      >
        <Field
          label="Reason"
          optional
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Left the institute at the end of the term."
          hint="Recorded in the audit log beside who made the change."
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        onConfirm={resetPassword}
        busy={busy === "reset"}
        tone="danger"
        icon="key"
        title="Reset this password?"
        confirmLabel="Reset password"
        description="Every session they have open stops working immediately, and the new password is shown to you once."
      >
        <Note tone="warn">
          Only do this with them in front of you or on the phone. The temporary
          password appears once and cannot be retrieved afterwards.
        </Note>
      </ConfirmDialog>
    </div>
  );
}
