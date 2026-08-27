"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCan, useSession } from "@/components/SessionProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { FormError, Note, TextArea } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
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
 *
 * All three outcomes are final, so all three go through a dialog. The
 * dialog's job is not to slow anyone down - it is to put the amount and the
 * name in front of them one more time, which is the check that actually
 * catches a misclick.
 */
export function ApprovalPanel({ payment }: { payment: Payment }) {
  const router = useRouter();
  const can = useCan();
  const session = useSession();
  const toast = useToast();

  const [busy, setBusy] = useState<Action | null>(null);
  const [prompting, setPrompting] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
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

  const amount = formatMoney(payment.amount_minor, payment.currency);

  async function run(action: Action) {
    setBusy(action);
    setError(null);
    try {
      await api.post(`/payments/${payment.public_id}/${action}`, {
        ...(action === "approve" ? {} : { reason }),
      });
      setPrompting(null);
      setReason("");
      toast({
        tone: action === "approve" ? "ok" : "info",
        title:
          action === "approve"
            ? "Payment approved"
            : action === "reject"
              ? "Payment rejected"
              : "Entry cancelled",
        description:
          action === "approve"
            ? `${amount} now counts against the balance.`
            : `${payment.public_id} is closed. The record stays in the ledger.`,
      });
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
    <Card>
      <CardHeader
        title="Decision"
        icon="check-circle"
        description="Recorded by one person, confirmed by another."
        divider
        className="mb-4"
      />

      {recordedByMe && mayApprove ? (
        <Note tone="info" icon="lock">
          You recorded this payment, so you cannot be the one who approves it.
          Someone else has to confirm the money arrived.
        </Note>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {mayApprove ? (
          <Button
            variant="primary"
            icon="check"
            busy={busy === "approve"}
            disabled={recordedByMe}
            title={
              recordedByMe
                ? "You recorded this payment. Someone else must approve it."
                : undefined
            }
            onClick={() => setPrompting("approve")}
          >
            Approve payment
          </Button>
        ) : null}
        {mayReject ? (
          <Button
            variant="danger"
            icon="close"
            onClick={() => setPrompting("reject")}
          >
            Reject
          </Button>
        ) : null}
        {mayCancel ? (
          <Button icon="minus" onClick={() => setPrompting("cancel")}>
            Cancel entry
          </Button>
        ) : null}
      </div>

      {error ? <div className="mt-4">{<FormError>{error}</FormError>}</div> : null}

      <p className="mt-4 border-t border-rule pt-4 text-xs leading-relaxed text-ink-faint">
        All three outcomes are final. There is no un-approve: a correction
        after the fact is a new record, so the ledger keeps both.
      </p>

      {/* --- approve --------------------------------------------------- */}
      <ConfirmDialog
        open={prompting === "approve"}
        onClose={() => setPrompting(null)}
        onConfirm={() => run("approve")}
        busy={busy === "approve"}
        tone="primary"
        icon="check"
        title="Approve this payment?"
        confirmLabel="Approve payment"
        description="This counts the money against the balance and cannot be undone."
      >
        <Summary payment={payment} amount={amount} />
      </ConfirmDialog>

      {/* --- reject: a reason is required ------------------------------ */}
      <ConfirmDialog
        open={prompting === "reject"}
        onClose={() => {
          setPrompting(null);
          setReason("");
        }}
        onConfirm={() => run("reject")}
        busy={busy === "reject"}
        disabled={!reason.trim()}
        tone="danger"
        icon="close"
        title="Reject this payment?"
        confirmLabel="Reject payment"
        description="The record stays in the ledger with the reason attached."
      >
        <Summary payment={payment} amount={amount} />
        <div className="mt-4">
          <TextArea
            label="Why is this being rejected?"
            required
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="The person who was refused has to be able to be told why."
            hint="Recorded against the payment and shown to whoever reads it."
          />
        </div>
      </ConfirmDialog>

      {/* --- cancel: reason optional ----------------------------------- */}
      <ConfirmDialog
        open={prompting === "cancel"}
        onClose={() => {
          setPrompting(null);
          setReason("");
        }}
        onConfirm={() => run("cancel")}
        busy={busy === "cancel"}
        tone="danger"
        icon="minus"
        title="Cancel this entry?"
        confirmLabel="Cancel entry"
        description="For an entry that should not have been made. It stays in the ledger, closed."
      >
        <Summary payment={payment} amount={amount} />
        <div className="mt-4">
          <TextArea
            label="Why is this being cancelled?"
            optional
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Recorded against the wrong enrolment."
          />
        </div>
      </ConfirmDialog>
    </Card>
  );
}

/** The amount and the name, once more, inside the dialog. */
function Summary({ payment, amount }: { payment: Payment; amount: string }) {
  return (
    <dl className="rounded-lg border border-rule bg-black/30 p-3.5">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-xs text-ink-faint">Amount</dt>
        <dd className="tabular text-lg font-semibold text-ink">{amount}</dd>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <dt className="text-xs text-ink-faint">Student</dt>
        <dd className="truncate text-sm text-ink">{payment.student_name}</dd>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <dt className="text-xs text-ink-faint">Reference</dt>
        <dd className="tabular text-sm text-ink-soft">{payment.public_id}</dd>
      </div>
    </dl>
  );
}
