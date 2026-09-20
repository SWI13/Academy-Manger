"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, FormError, Note } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { useDict } from "@/components/LocaleProvider";

/**
 * Changing your own password.
 *
 * The current one is required, and that is not ceremony: an unattended
 * session at a reception desk is the realistic threat here, and asking for
 * the old password is what stops a passer-by from locking the owner out of
 * their own account.
 *
 * The rules on the new one belong to Django's validators, so no strength
 * meter is drawn here that could disagree with them. What comes back is the
 * validator's own sentence, put beside the field it belongs to.
 */
export function ChangePassword() {
  const d = useDict();
  const router = useRouter();
  const toast = useToast();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm !== "" && next !== confirm;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch) return;

    setBusy(true);
    setErrors({});
    setMessage(null);

    try {
      await api.post("/auth/password/change", {
        current_password: current,
        new_password: next,
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast({
        tone: "ok",
        title: d.account.changed,
        description: d.account.changedNote,
      });
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiFailure) {
        setErrors(failure.fieldErrors());
        setMessage(failure.message);
      } else {
        setMessage("Could not reach the server.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="div">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <CardHeader
          title={d.account.password}
          icon="key"
          description={d.account.passwordNote}
          divider
        />

        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <Field
            label={d.account.current}
            type="password"
            required
            autoComplete="current-password"
            icon="lock"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            error={errors.current_password}
            wrapperClassName="sm:col-span-2"
          />
          <Field
            label={d.account.newPassword}
            type="password"
            required
            autoComplete="new-password"
            icon="key"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            error={errors.new_password}
            hint={d.account.newPasswordHint}
          />
          <Field
            label={d.account.repeat}
            type="password"
            required
            autoComplete="new-password"
            icon="key"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            error={mismatch ? d.account.mismatch : undefined}
          />
        </div>

        <Note tone="neutral" icon="info">
          Changing your password does not sign you out of this browser. If you
          think somebody else has been using your account, tell an
          administrator — they can reset it, which does end every session.
        </Note>

        {message ? <FormError>{message}</FormError> : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-5">
          <Button
            type="submit"
            variant="primary"
            icon="check"
            busy={busy}
            disabled={!current || !next || !confirm || mismatch}
          >{d.account.submit}</Button>
        </div>
      </form>
    </Card>
  );
}
