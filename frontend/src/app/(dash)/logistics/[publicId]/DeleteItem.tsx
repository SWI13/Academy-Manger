"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDict, useFill } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";

/**
 * Removing an item, with the sentence that says what removing means.
 *
 * The confirmation is not a formality. The dialog names the item and says
 * where the record goes, because "Are you sure?" over an inventory of four
 * hundred rows is a question nobody can answer - the useful information is
 * *which* row, and this is where it is given.
 *
 * On the server this is a soft delete. The item leaves every list and every
 * total at once, and the audit log keeps who removed it.
 */
export function DeleteItem({ publicId, name }: { publicId: string; name: string }) {
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
      await api.delete(`/logistics/items/${publicId}`);
      toast({ tone: "ok", title: d.logistics.itemDeleted, description: publicId });
      setOpen(false);
      router.push("/logistics");
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof ApiFailure ? failure.message : d.ui.serverUnreachable,
      );
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="danger" icon="close" onClick={() => setOpen(true)}>
        {d.logistics.deleteItem}
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={remove}
        title={d.logistics.deleteItem}
        description={t(d.logistics.deleteItemBody, { name })}
        confirmLabel={d.logistics.deleteItem}
        icon="alert"
        busy={busy}
      >
        {/* The failure stays beside the action that caused it rather than
            becoming a toast that has gone by the time it is read. */}
        {error ? (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
