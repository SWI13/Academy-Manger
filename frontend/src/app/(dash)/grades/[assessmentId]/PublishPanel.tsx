"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCan } from "@/components/SessionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { FormError, Note } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Assessment } from "@/types";

/**
 * Releasing marks to students.
 *
 * Until this happens, students see nothing - not the mark and not the
 * average, because the average is computed over published marks only for
 * them. Publishing notifies every student who actually has a mark, and nobody
 * else: telling someone their result is ready when none was entered is worse
 * than silence.
 *
 * There is deliberately no unpublish. Once a class has seen a mark, hiding it
 * again does not unsee it, and the honest fix for a wrong mark is to correct
 * it - which a professor may do at any time (architecture D-7). That makes
 * publishing a one-way door, so it goes through a dialog that says so.
 */
export function PublishPanel({
  assessment,
  unmarked,
}: {
  assessment: Assessment;
  unmarked: number;
}) {
  const router = useRouter();
  const can = useCan();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!can("score.publish")) return null;

  if (assessment.is_published) {
    return (
      <Card className="border-ok-line bg-ok-wash">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="ok" dot>
            Published
          </Badge>
          <p className="text-sm text-ink-soft">
            Released {formatDateTime(assessment.published_at)}. Students can see
            their own mark.
          </p>
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-ink-faint">
          Corrections made from here on are visible to students immediately, and
          the row records that it changed.
        </p>
      </Card>
    );
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/assessments/${assessment.id}/publish`);
      setAsking(false);
      toast({
        tone: "ok",
        title: "Marks published",
        description: "Everyone with a mark has been notified.",
      });
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof ApiFailure
          ? failure.message
          : "Could not reach the server.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Not published"
        icon="lock"
        description="Students cannot see these marks yet. Publishing notifies everyone who has one."
        divider
        className="mb-4"
      />

      {unmarked > 0 ? (
        <Note tone="warn">
          {unmarked} {unmarked === 1 ? "student has" : "students have"} no mark
          yet. They will not be notified, and nothing will appear for them —
          publishing now simply leaves them out.
        </Note>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" icon="check-circle" onClick={() => setAsking(true)}>
          Publish marks
        </Button>
      </div>

      {error ? <div className="mt-4">{<FormError>{error}</FormError>}</div> : null}

      <p className="mt-4 border-t border-rule pt-4 text-xs leading-relaxed text-ink-faint">
        There is no unpublish. Hiding a mark a class has already seen does not
        unsee it — correct it instead, which you can do at any time.
      </p>

      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        onConfirm={publish}
        busy={busy}
        tone="primary"
        icon="check-circle"
        title="Publish these marks?"
        confirmLabel="Publish marks"
        description="Every student with a mark is notified. This cannot be undone — a wrong mark is corrected, not hidden."
      >
        {unmarked > 0 ? (
          <Note tone="warn">
            {unmarked} {unmarked === 1 ? "student has" : "students have"} no
            mark. Publishing now leaves them out; you can mark them afterwards
            and they will see it straight away.
          </Note>
        ) : (
          <Note tone="ok">Every student on the roster has a mark.</Note>
        )}
      </ConfirmDialog>
    </Card>
  );
}
