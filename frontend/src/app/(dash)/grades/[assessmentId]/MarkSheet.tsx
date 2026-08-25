"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCan } from "@/components/SessionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ApiFailure, api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Assessment, Enrollment, Score } from "@/types";

type Row = {
  publicId: string;
  name: string;
  value: string;
  comment: string;
  existing: Score | null;
};

/**
 * The whole sheet, saved in one request.
 *
 * The API replaces the sheet in a single transaction: forty marks either all
 * save or none do. So this holds the whole class in local state and sends it
 * once, rather than firing a request per input. A dropped connection halfway
 * down a class list must not leave half a sheet written, with nobody able to
 * tell which half.
 *
 * Blank means "not marked yet" and is left out of the payload entirely -
 * distinct from a zero, which is a mark of nought.
 */
export function MarkSheet({
  assessment,
  roster,
  scores,
}: {
  assessment: Assessment;
  roster: Enrollment[];
  scores: Score[];
}) {
  const router = useRouter();
  const can = useCan();
  const mayEnter = can("score.enter");

  const byStudent = new Map(scores.map((score) => [score.student_public_id, score]));

  const [rows, setRows] = useState<Row[]>(() =>
    roster.map((enrollment) => {
      const existing = byStudent.get(enrollment.student.public_id) ?? null;
      return {
        publicId: enrollment.student.public_id,
        name: enrollment.student.full_name,
        value: existing ? String(Number(existing.score)) : "",
        comment: existing?.comment ?? "",
        existing,
      };
    }),
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const max = Number(assessment.max_score);

  function update(publicId: string, patch: Partial<Row>) {
    setSaved(null);
    setRows((current) =>
      current.map((row) => (row.publicId === publicId ? { ...row, ...patch } : row)),
    );
  }

  const invalid = rows.filter((row) => {
    if (row.value.trim() === "") return false;
    const number = Number(row.value);
    return Number.isNaN(number) || number < 0 || number > max;
  });

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(null);

    const payload = rows
      .filter((row) => row.value.trim() !== "")
      .map((row) => ({
        student_public_id: row.publicId,
        score: row.value.trim(),
        comment: row.comment.trim(),
      }));

    try {
      const result = await api.put<{ created: number; updated: number }>(
        `/assessments/${assessment.id}/scores`,
        { rows: payload },
      );
      setSaved(
        `${result.created} entered, ${result.updated} corrected.`,
      );
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiFailure) {
        const details = Object.values(failure.details).flat();
        setError(details.length ? String(details[0]) : failure.message);
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setBusy(false);
    }
  }

  const marked = rows.filter((row) => row.value.trim() !== "").length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Mark sheet
        </h2>
        <p className="tabular text-sm text-ink-soft">
          {marked} of {rows.length} marked · out of {max}
        </p>
      </div>

      <div className="overflow-x-auto rounded border border-rule bg-surface">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">Marks for {assessment.title}</caption>
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Student
              </th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Mark
              </th>
              <th scope="col" className="hidden px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint sm:table-cell">
                Comment
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                History
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const number = Number(row.value);
              const bad =
                row.value.trim() !== "" &&
                (Number.isNaN(number) || number < 0 || number > max);

              return (
                <tr key={row.publicId} className="border-b border-rule last:border-b-0">
                  <td className="px-3 py-2">
                    <p className="text-ink">{row.name}</p>
                    <p className="tabular text-xs text-ink-faint">{row.publicId}</p>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.25"
                      min={0}
                      max={max}
                      disabled={!mayEnter}
                      value={row.value}
                      aria-label={`Mark for ${row.name}, out of ${max}`}
                      aria-invalid={bad || undefined}
                      onChange={(event) =>
                        update(row.publicId, { value: event.target.value })
                      }
                      className={`tabular w-24 rounded border bg-surface px-2 py-1 text-right text-ink disabled:opacity-60 ${
                        bad ? "border-bad" : "border-rule-strong"
                      }`}
                      placeholder="—"
                    />
                  </td>
                  <td className="hidden px-3 py-2 sm:table-cell">
                    <input
                      type="text"
                      disabled={!mayEnter}
                      value={row.comment}
                      aria-label={`Comment for ${row.name}`}
                      onChange={(event) =>
                        update(row.publicId, { comment: event.target.value })
                      }
                      className="w-56 rounded border border-rule-strong bg-surface px-2 py-1 text-ink disabled:opacity-60"
                      placeholder="Optional"
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-faint">
                    {row.existing?.was_edited ? (
                      <>
                        <Badge tone="warn">
                          corrected ×{row.existing.change_count}
                        </Badge>
                        <p className="mt-1">
                          {formatDate(row.existing.last_changed_at)} ·{" "}
                          {row.existing.last_changed_by_public_id}
                        </p>
                      </>
                    ) : row.existing ? (
                      formatDate(row.existing.entered_at)
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mayEnter ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            busy={busy}
            disabled={invalid.length > 0}
            onClick={save}
          >
            Save sheet
          </Button>
          {invalid.length ? (
            <p className="text-sm text-bad">
              {invalid.length} {invalid.length === 1 ? "mark is" : "marks are"}{" "}
              outside 0–{max}.
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="text-sm text-ok">
              {saved}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-ink-faint">
        A blank is not a zero — leave it empty for anyone you have not marked.
        The sheet saves as one unit: either every mark lands or none does.
      </p>
    </section>
  );
}
