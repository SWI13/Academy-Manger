"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCan, useSession } from "@/components/SessionProvider";
import { Button } from "@/components/ui/Button";
import { ApiFailure, api } from "@/lib/api";
import type { Payment } from "@/types";

type Action = "approve" | "reject" | "cancel";

/**
 * The three transitions, and the one rule that has to be visible.
 *
 * A payment cannot be approved by whoever recorded it. That is enforced in
 * Django - `approve()` refuses when `created_by == actor` - and the panel
 * says so instead of letting someone press a button that returns 409. A
 * separation-of-duty rule people discover by being refused is a rule they
 * learn to resent; one the screen explains is a rule they understand.
 */
export function ApprovalPanel({ payment }: { payment: Payment }) {
  const router = useRouter();
  const can = useCan();
  const session = useSession();

  const [busy, setBusy] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [prompting, setPrompting] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (payment.status !== "PENDING") {
    return null;
  }

  const recordedByMe = payment.created_by_public_id === session.public_id;
  const mayApprove = can("payment.approve");
  const mayReject = can("payment.reject");
  // Reception may withdraw its own mistaken entry; an approver may cancel any.
  const mayCancel = can("payment.cancel") && (mayApprove || recordedByMe);

  if (!mayApprove && !mayReject && !mayCancel) {
    return null;
  }

  async function run(action: Action) {
    setBusy(action);
    setError(null);
    try {
      await api.post(`/payments/${payment.public_id}/${action}`, {
        ...(action === "approve" ? {} : { reason }),
      });
      setPrompting(null);
      setReason("");
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
    <section className="rounded border border-rule bg-surface p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
        Decision
      </h2>

      {recordedByMe && mayApprove ? (
        <p className="mt-3 rounded border border-info/25 bg-info-wash px-3 py-2 text-sm text-info">
          You recorded this payment, so you cannot be the one who approves it.
          Someone else has to confirm the money arrived.
        </p>
      ) : null}

      {prompting ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-sm font-medium text-ink" htmlFor="reason">
            {prompting === "reject"
              ? "Why is this being rejected?"
              : "Why is this being cancelled? (optional)"}
          </label>
          <textarea
            id="reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="rounded border border-rule-strong bg-surface px-3 py-2 text-sm text-ink"
            placeholder={
              prompting === "reject"
                ? "The person who was refused has to be able to be told why."
                : "Recorded against the wrong enrolment."
            }
          />
          <div className="flex gap-2">
            <Button
              variant={prompting === "reject" ? "danger" : "secondary"}
              busy={busy === prompting}
              disabled={prompting === "reject" && !reason.trim()}
              onClick={() => run(prompting)}
            >
              Confirm {prompting}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setPrompting(null);
                setReason("");
                setError(null);
              }}
            >
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {mayApprove ? (
            <Button
              variant="primary"
              busy={busy === "approve"}
              disabled={recordedByMe}
              title={
                recordedByMe
                  ? "You recorded this payment. Someone else must approve it."
                  : undefined
              }
              onClick={() => run("approve")}
            >
              Approve
            </Button>
          ) : null}
          {mayReject ? (
            <Button variant="danger" onClick={() => setPrompting("reject")}>
              Reject
            </Button>
          ) : null}
          {mayCancel ? (
            <Button variant="secondary" onClick={() => setPrompting("cancel")}>
              Cancel entry
            </Button>
          ) : null}
        </div>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded border border-bad/30 bg-bad-wash px-3 py-2 text-sm text-bad"
        >
          {error}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-ink-faint">
        All three outcomes are final. There is no un-approve: a correction
        after the fact is a new record, so the ledger keeps both.
      </p>
    </section>
  );
}
