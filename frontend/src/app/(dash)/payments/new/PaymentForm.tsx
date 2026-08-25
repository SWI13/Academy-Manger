"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Field,
  FormActions,
  FormError,
  Note,
  Select,
  TextArea,
} from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Stars";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { PAYMENT_METHODS } from "@/lib/choices";
import { formatMoney, toMinorUnits } from "@/lib/format";
import type { Enrollment, Payment } from "@/types";

import type { Balance } from "../../enrollments/[id]/BalanceCard";

/**
 * Recording money that arrived.
 *
 * What the form does not have is the point of it. There is no status field:
 * everything is created pending and moves by a named transition, so nobody
 * can post a payment straight to approved and skip the review that makes the
 * record trustworthy. There is no currency field either - it is copied from
 * the enrolment, which took it from the course.
 *
 * The balance beside the amount is fetched from the API for the chosen
 * enrolment and rendered as it arrives. Nothing here subtracts the amount
 * being typed from the remainder: that figure belongs to the backend and
 * appears when the payment is approved, not while it is being typed.
 */
export function PaymentForm({
  enrolments,
  preset,
  mayApprove,
}: {
  enrolments: Enrollment[];
  preset: string | null;
  mayApprove: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [enrollmentId, setEnrollmentId] = useState(
    preset && enrolments.some((row) => String(row.id) === preset) ? preset : "",
  );
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState("CASH");
  const [notes, setNotes] = useState("");

  // Keyed by the enrolment it describes, so a balance is never shown under
  // a student it does not belong to. Clearing it on selection would mean a
  // setState in the body of an effect - and this says the same thing without
  // an extra render.
  const [fetched, setFetched] = useState<{ id: string; balance: Balance } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const enrolment =
    enrolments.find((row) => String(row.id) === enrollmentId) ?? null;
  const currency = enrolment?.currency ?? "DZD";

  const minor = amount.trim() === "" ? null : toMinorUnits(amount, currency);
  const amountError =
    amount.trim() !== "" && minor === null
      ? "Enter an amount, like 20000 or 20000.50."
      : minor !== null && minor <= 0
        ? "An amount has to be more than nothing."
        : undefined;

  // The balance for the chosen enrolment, from the endpoint that owns it.
  // A figure derived in the browser would eventually disagree with the ledger.
  useEffect(() => {
    if (!enrollmentId) return;

    let live = true;
    api
      .get<Balance>(`/enrollments/${enrollmentId}/balance`)
      .then((result) => {
        if (live) setFetched({ id: enrollmentId, balance: result });
      })
      .catch(() => {
        // A balance that will not load is not a reason to block the payment.
      });
    return () => {
      live = false;
    };
  }, [enrollmentId]);

  const balance = fetched?.id === enrollmentId ? fetched.balance : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (minor === null || minor <= 0) return;

    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const created = await api.post<Payment>("/payments", {
        enrollment_id: Number(enrollmentId),
        amount_minor: minor,
        paid_on: paidOn,
        method,
        notes: notes.trim(),
      });
      toast({
        tone: "ok",
        title: "Payment recorded",
        description: `${created.public_id} is pending approval.`,
      });
      router.push(`/payments/${created.public_id}`);
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiFailure) {
        setFieldErrors(failure.fieldErrors());
        setError(failure.message);
      } else {
        setError("Could not reach the server.");
      }
      setBusy(false);
    }
  }

  if (!enrolments.length) {
    return (
      <Card>
        <Note tone="neutral">
          There is no active enrolment to record a payment against. Enrol the
          student first — money is always attached to a student on a course,
          never to a person alone.
        </Note>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-6">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Enrolment"
            required
            value={enrollmentId}
            onChange={(event) => setEnrollmentId(event.target.value)}
            placeholder="Choose a student and course"
            options={enrolments.map((row) => ({
              value: String(row.id),
              label: `${row.student.full_name} — ${row.course_title}`,
            }))}
            error={fieldErrors.enrollment_id}
            hint="Active enrolments only. Money against a withdrawn one needs a live enrolment first."
            wrapperClassName="sm:col-span-2"
          />

          <Field
            label="Amount"
            required
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="20000"
            suffix={currency}
            error={amountError ?? fieldErrors.amount_minor}
            hint={
              minor !== null && !amountError
                ? `Recorded as ${formatMoney(minor, currency)}`
                : "The amount handed over, in whole units or with centimes."
            }
          />

          <Field
            label="Paid on"
            type="date"
            required
            max={today()}
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
            error={fieldErrors.paid_on}
            hint="The day the money arrived, not today’s date if they differ."
          />

          <Select
            label="Method"
            required
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            options={PAYMENT_METHODS}
            placeholder="How it was paid"
            error={fieldErrors.method}
          />

          <TextArea
            label="Notes"
            optional
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Second instalment; receipt number 41."
            error={fieldErrors.notes}
          />
        </div>
      </Card>

      {/* --- what this enrolment already owes ------------------------- */}
      {enrolment ? (
        <Card className="animate-rise">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Against</p>
              <p className="mt-1.5 font-medium text-ink">
                {enrolment.student.full_name}
              </p>
              <p className="tabular text-xs text-ink-faint">
                {enrolment.student.public_id} · {enrolment.course_title} (
                {enrolment.course_public_id})
              </p>
            </div>
          </div>

          {balance ? (
            <div className="mt-5 border-t border-rule pt-4">
              <Meter
                value={balance.paid_minor}
                max={balance.total_minor}
                tone={balance.is_settled ? "ok" : "accent"}
                label={`${formatMoney(balance.paid_minor, balance.currency)} paid of ${formatMoney(balance.total_minor, balance.currency)}`}
              />
              <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Pair
                  label="Agreed"
                  value={formatMoney(balance.total_minor, balance.currency)}
                />
                <Pair
                  label="Paid"
                  value={formatMoney(balance.paid_minor, balance.currency)}
                  tone="text-ok"
                />
                <Pair
                  label="Pending"
                  value={formatMoney(balance.pending_minor, balance.currency)}
                  tone="text-warn"
                />
                <Pair
                  label="Remaining"
                  value={formatMoney(balance.remaining_minor, balance.currency)}
                  tone={balance.remaining_minor > 0 ? "text-bad" : "text-ok"}
                />
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                These are the backend’s figures as they stand now. The
                remaining amount changes when this payment is approved, not
                when it is recorded.
              </p>
            </div>
          ) : (
            <p className="mt-4 border-t border-rule pt-4 text-[13px] text-ink-faint">
              Loading the balance…
            </p>
          )}
        </Card>
      ) : null}

      <Note tone={mayApprove ? "info" : "neutral"} icon="lock">
        {mayApprove
          ? "This entry will be pending. You will not be able to approve it yourself — whoever records a payment cannot be the one who confirms it arrived."
          : "This entry will be pending until somebody with approval rights confirms it. Reception records money; it does not approve it."}
      </Note>

      {error ? <FormError>{error}</FormError> : null}

      <FormActions
        note={
          <span className="inline-flex items-center gap-1.5">
            <Icon name="file" size={14} />
            Attach the bank slip on the payment’s own page, once it exists.
          </span>
        }
      >
        <Button
          type="submit"
          variant="primary"
          icon="check"
          busy={busy}
          disabled={!enrollmentId || minor === null || minor <= 0 || !paidOn}
        >
          Record payment
        </Button>
      </FormActions>
    </form>
  );
}

function Pair({
  label,
  value,
  tone = "text-ink",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className={`tabular mt-0.5 text-sm font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

/** Today, in the yyyy-mm-dd a date input wants, in the reader's own zone. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
