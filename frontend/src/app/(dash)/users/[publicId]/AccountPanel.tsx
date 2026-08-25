"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCan, useSession } from "@/components/SessionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ApiFailure, api } from "@/lib/api";
import { manageableRoles } from "@/lib/manageable";
import { ROLE_LABELS, type RoleCode } from "@/lib/permissions";
import type { User } from "@/types";

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

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [temporary, setTemporary] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const isSelf = user.public_id === session.public_id;
  const mayAssignRoles = can("user.assign_role");
  const mayChangeStatus = can("user.deactivate") && !isSelf;
  const mayReset = can("user.reset_password");
  const grantable = manageableRoles(can);

  async function call(label: string, run: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await run();
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
    <div className="flex flex-col gap-4">
      {/* --- roles --- */}
      <section className="rounded border border-rule bg-surface p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Roles
        </h2>

        <div className="mt-3 flex flex-wrap gap-2">
          {user.roles.length ? (
            user.roles.map((code) => (
              <Badge key={code} tone={code === user.primary_role ? "info" : "neutral"}>
                {ROLE_LABELS[code as RoleCode] ?? code}
                {code === user.primary_role ? " · primary" : ""}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-ink-faint">None</span>
          )}
        </div>

        {isSelf ? (
          <p className="mt-3 border-t border-rule pt-3 text-sm text-ink-faint">
            Nobody changes their own roles, the owner included. Self-escalation
            is exactly what that rule closes.
          </p>
        ) : mayAssignRoles ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
            {grantable
              .filter((code) => !user.roles.includes(code))
              .map((code) => (
                <Button
                  key={code}
                  busy={busy === `grant-${code}`}
                  onClick={() =>
                    call(`grant-${code}`, () =>
                      api.post(`/users/${user.public_id}/roles`, { role: code }),
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
                      variant="danger"
                      busy={busy === `revoke-${code}`}
                      onClick={() =>
                        call(`revoke-${code}`, () =>
                          api.delete(`/users/${user.public_id}/roles`, {
                            role: code,
                          }),
                        )
                      }
                    >
                      Revoke {ROLE_LABELS[code as RoleCode] ?? code}
                    </Button>
                  ))
              : null}
          </div>
        ) : (
          <p className="mt-3 border-t border-rule pt-3 text-sm text-ink-faint">
            Only the owner grants and revokes roles — an administrator manages
            people but cannot hand out powers, including to themselves.
          </p>
        )}
      </section>

      {/* --- status --- */}
      <section className="rounded border border-rule bg-surface p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Account status
        </h2>

        {isSelf ? (
          <p className="mt-3 text-sm text-ink-faint">
            This is your own account. Nobody changes their own status — a
            deactivate button here would be a way to lock yourself out of the
            system you administer.
          </p>
        ) : mayChangeStatus ? (
          <>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason (recorded in the audit log)"
              aria-label="Reason for the status change"
              className="mt-3 w-full rounded border border-rule-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {user.status !== "ACTIVE" ? (
                <Button
                  variant="primary"
                  busy={busy === "ACTIVE"}
                  onClick={() =>
                    call("ACTIVE", () =>
                      api.post(`/users/${user.public_id}/status`, {
                        status: "ACTIVE",
                        reason,
                      }),
                    )
                  }
                >
                  Reactivate
                </Button>
              ) : null}
              {user.status !== "SUSPENDED" ? (
                <Button
                  busy={busy === "SUSPENDED"}
                  onClick={() =>
                    call("SUSPENDED", () =>
                      api.post(`/users/${user.public_id}/status`, {
                        status: "SUSPENDED",
                        reason,
                      }),
                    )
                  }
                >
                  Suspend
                </Button>
              ) : null}
              {user.status !== "INACTIVE" ? (
                <Button
                  variant="danger"
                  busy={busy === "INACTIVE"}
                  onClick={() =>
                    call("INACTIVE", () =>
                      api.post(`/users/${user.public_id}/status`, {
                        status: "INACTIVE",
                        reason,
                      }),
                    )
                  }
                >
                  Deactivate
                </Button>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-ink-faint">
              Deactivating takes effect on their very next request — the session
              lives on the server, not in a token that has to expire.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-faint">
            Your role cannot change this account&rsquo;s status.
          </p>
        )}
      </section>

      {/* --- password --- */}
      {mayReset && !isSelf ? (
        <section className="rounded border border-rule bg-surface p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Password
          </h2>

          {temporary ? (
            <div className="mt-3 rounded border border-warn/30 bg-warn-wash p-3">
              <p className="text-sm font-medium text-warn">
                Give this to them now. It is not shown again.
              </p>
              <p className="tabular mt-2 select-all break-all font-mono text-base text-ink">
                {temporary}
              </p>
              <p className="mt-2 text-xs text-ink-soft">
                Their existing sessions are already invalid — a reset locks out
                whoever was using the account, which is the point of a reset.
              </p>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink-soft">
                Issues a temporary password, shown once. Nobody can read their
                old one — it was never stored in a readable form.
              </p>
              <Button
                className="mt-3"
                busy={busy === "reset"}
                onClick={resetPassword}
              >
                Reset password
              </Button>
            </>
          )}
        </section>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded border border-bad/30 bg-bad-wash px-3 py-2 text-sm text-bad"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
