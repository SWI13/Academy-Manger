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
import { useDict } from "@/components/LocaleProvider";

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
  const d = useDict();
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
          <Badge tone="ok" dot>{d.courses.published}</Badge>
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
        title: d.audit.actions.marksPublished,
        description: d.grades.marksPublishedNote,
      });
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof ApiFailure
          ? failure.message
          : d.ui.serverUnreachable,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={d.courses.notPublished}
        icon="lock"
        description={d.grades.notPublishedNote}
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
        <Button variant="primary" icon="check-circle" onClick={() => setAsking(true)}>{d.grades.publishAction}</Button>
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
        title={d.grades.publishTitle}
        confirmLabel={d.grades.publishAction}
        description={d.grades.publishBody}
      >
        {unmarked > 0 ? (
          <Note tone="warn">
            {unmarked} {unmarked === 1 ? "student has" : "students have"} no
            mark. Publishing now leaves them out; you can mark them afterwards
            and they will see it straight away.
          </Note>
        ) : (
          <Note tone="ok">{d.grades.publishedNote}</Note>
        )}
      </ConfirmDialog>
    </Card>
  );
}
