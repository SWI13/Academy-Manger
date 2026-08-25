"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCan } from "@/components/SessionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ApiFailure, api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Assessment } from "@/types";

/**
 * Releasing marks to students.
 *
 * Until this happens, students see nothing - not the mark and not the
 * average, because the average is computed over published marks only for
 * them. Publishing notifies every student who actually has a mark, and
 * nobody else: telling someone their result is ready when none was entered
 * is worse than silence.
 *
 * There is deliberately no unpublish. Once a class has seen a mark, hiding it
 * again does not unsee it, and the honest fix for a wrong mark is to correct
 * it - which a professor may do at any time (architecture D-7).
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!can("score.publish")) return null;

  if (assessment.is_published) {
    return (
      <section className="rounded border border-ok/25 bg-ok-wash p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="ok">Published</Badge>
          <p className="text-sm text-ink-soft">
            Released {formatDateTime(assessment.published_at)}. Students can see
            their own mark.
          </p>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Corrections made from here on are visible to students immediately, and
          the row records that it changed.
        </p>
      </section>
    );
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/assessments/${assessment.id}/publish`);
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
    <section className="rounded border border-rule bg-surface p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
        Not published
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        Students cannot see these marks yet. Publishing notifies everyone who
        has one.
      </p>

      {unmarked > 0 ? (
        <p className="mt-3 rounded border border-warn/25 bg-warn-wash px-3 py-2 text-sm text-warn">
          {unmarked} {unmarked === 1 ? "student has" : "students have"} no mark
          yet. They will not be notified, and nothing will appear for them —
          publishing now simply leaves them out.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" busy={busy} onClick={publish}>
          Publish marks
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-ink-faint">
        There is no unpublish. Hiding a mark a class has already seen does not
        unsee it — correct it instead, which you can do at any time.
      </p>
    </section>
  );
}
