"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDict, useFill } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";

/**
 * Removing an expense, and going back to the month it came out of.
 *
 * The month matters: returning to whichever month the list happened to be
 * showing would leave somebody looking at an unchanged total wondering
 * whether the deletion worked.
 *
 * Soft on the server. The entry leaves this month's total at once and the
 * audit log keeps who removed it.
 */
export function DeleteExpense({
  publicId,
  name,
  year,
  month,
}: {
  publicId: string;
  name: string;
  year: number;
  month: number;
}) {
  const d = useDict();
  const t = useFill();
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/logistics/expenses/${publicId}`);
      toast({ tone: "ok", title: d.logistics.expenseDeleted, description: publicId });
      setOpen(false);
      router.push(`/logistics/expenses?year=${year}&month=${month}`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : d.ui.serverUnreachable);
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="danger" icon="close" onClick={() => setOpen(true)}>
        {d.logistics.deleteExpense}
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={remove}
        title={d.logistics.deleteExpense}
        description={t(d.logistics.deleteExpenseBody, { name })}
        confirmLabel={d.logistics.deleteExpense}
        icon="alert"
        busy={busy}
      >
        {error ? (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
