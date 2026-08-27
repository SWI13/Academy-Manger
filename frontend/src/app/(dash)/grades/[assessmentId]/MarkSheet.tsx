"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useCan } from "@/components/SessionProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Card";
import { FormError } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Stars";
import { useToast } from "@/components/ui/Toast";
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
 * distinct from a zero, which is a mark of nought. That rule is a business
 * rule, so the sheet says it out loud rather than relying on the professor to
 * remember it.
 *
 * It is built to be typed rather than clicked: Enter and the arrow keys walk
 * down the column, which is how anyone marking thirty papers actually works.
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
  const toast = useToast();
  const mayEnter = can("score.enter");

  const byStudent = new Map(
    scores.map((score) => [score.student_public_id, score]),
  );

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
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const max = Number(assessment.max_score);

  function update(publicId: string, patch: Partial<Row>) {
    setSaved(null);
    setDirty(true);
    setRows((current) =>
      current.map((row) =>
        row.publicId === publicId ? { ...row, ...patch } : row,
      ),
    );
  }

  /** Enter and the arrows move down the column, the way a spreadsheet does. */
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const move =
      event.key === "Enter" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowUp"
          ? -1
          : 0;
    if (!move) return;

    const next = inputs.current[index + move];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.select();
  }

  function invalidOf(row: Row): boolean {
    if (row.value.trim() === "") return false;
    const number = Number(row.value);
    return Number.isNaN(number) || number < 0 || number > max;
  }

  const invalid = rows.filter(invalidOf);
  const marked = rows.filter((row) => row.value.trim() !== "").length;

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
      const summary = `${result.created} entered, ${result.updated} corrected.`;
      setSaved(summary);
      setDirty(false);
      toast({ tone: "ok", title: "Sheet saved", description: summary });
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

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader
        title="Mark sheet"
        description={`Out of ${max}. A blank is not a zero — leave it empty for anyone you have not marked.`}
        action={
          <div className="flex items-center gap-3">
            <span className="tabular text-[13px] text-ink-soft">
              {marked} / {rows.length} marked
            </span>
            <Meter
              value={marked}
              max={rows.length}
              tone={marked === rows.length ? "ok" : "accent"}
              label={`${marked} of ${rows.length} students marked`}
              className="w-20"
            />
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl border border-rule bg-surface">
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Marks for {assessment.title}</caption>
            <thead>
              <tr className="border-b border-rule bg-black/40">
                {/*
                  The name column sticks. Scrolling right to reach the comment
                  box and losing sight of whose row it is is how a comment ends
                  up on the wrong student.
                */}
                <th
                  scope="col"
                  className="eyebrow sticky left-0 z-10 bg-black/40 px-4 py-2.5 text-left"
                >
                  Student
                </th>
                <th scope="col" className="eyebrow px-4 py-2.5 text-right">
                  Mark
                </th>
                <th
                  scope="col"
                  className="eyebrow hidden px-4 py-2.5 text-left sm:table-cell"
                >
                  Comment
                </th>
                <th scope="col" className="eyebrow px-4 py-2.5 text-left">
                  History
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const bad = invalidOf(row);
                const blank = row.value.trim() === "";

                return (
                  <tr
                    key={row.publicId}
                    className="group border-b border-rule transition-colors last:border-b-0 hover:bg-white/[0.06]"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left font-normal transition-colors group-hover:bg-white/[0.06]"
                    >
                      <span className="flex items-center gap-2.5">
                        <Avatar
                          name={row.name}
                          seed={row.publicId}
                          size="xs"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">
                            {row.name}
                          </span>
                          <span className="tabular block text-xs text-ink-faint">
                            {row.publicId}
                          </span>
                        </span>
                      </span>
                    </th>

                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <input
                          ref={(element) => {
                            inputs.current[index] = element;
                          }}
                          type="number"
                          inputMode="decimal"
                          step="0.25"
                          min={0}
                          max={max}
                          disabled={!mayEnter}
                          value={row.value}
                          aria-label={`Mark for ${row.name}, out of ${max}`}
                          aria-invalid={bad || undefined}
                          onKeyDown={(event) => onKeyDown(event, index)}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) =>
                            update(row.publicId, { value: event.target.value })
                          }
                          className={`tabular h-9 w-20 rounded-md border bg-surface px-2.5 text-right text-sm text-ink shadow-xs transition-colors disabled:bg-sunk disabled:text-ink-faint ${
                            bad
                              ? "border-bad"
                              : blank
                                ? "border-dashed border-rule-strong"
                                : "border-rule-strong hover:border-ink-faint focus:border-accent"
                          }`}
                          placeholder="—"
                        />
                        <span className="tabular w-8 text-left text-xs text-ink-faint">
                          /{max}
                        </span>
                      </span>
                    </td>

                    <td className="hidden px-4 py-2.5 sm:table-cell">
                      <input
                        type="text"
                        disabled={!mayEnter}
                        value={row.comment}
                        aria-label={`Comment for ${row.name}`}
                        onChange={(event) =>
                          update(row.publicId, { comment: event.target.value })
                        }
                        className="h-9 w-full min-w-40 rounded-md border border-rule-strong bg-surface px-2.5 text-sm text-ink shadow-xs transition-colors placeholder:text-ink-faint hover:border-ink-faint focus:border-accent disabled:bg-sunk disabled:text-ink-faint"
                        placeholder="Optional"
                      />
                    </td>

                    <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                      {row.existing?.was_edited ? (
                        <span className="flex flex-col items-start gap-1">
                          <Badge tone="warn" size="sm">
                            corrected ×{row.existing.change_count}
                          </Badge>
                          <span className="tabular text-ink-faint">
                            {formatDate(row.existing.last_changed_at)} ·{" "}
                            {row.existing.last_changed_by_public_id}
                          </span>
                        </span>
                      ) : row.existing ? (
                        <span className="tabular text-ink-faint">
                          {formatDate(row.existing.entered_at)}
                        </span>
                      ) : (
                        <span className="text-ink-faint">Not marked</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* --- the save bar, attached to the sheet it saves ----------- */}
        {mayEnter ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-rule bg-white/[0.04] px-4 py-3">
            <Button
              variant="primary"
              icon="check"
              busy={busy}
              disabled={invalid.length > 0 || !dirty}
              onClick={save}
            >
              Save sheet
            </Button>

            {invalid.length ? (
              <p className="flex items-center gap-1.5 text-[13px] text-bad">
                <Icon name="alert" size={14} />
                {invalid.length} {invalid.length === 1 ? "mark is" : "marks are"}{" "}
                outside 0–{max}
              </p>
            ) : dirty ? (
              <p className="flex items-center gap-1.5 text-[13px] text-warn">
                <Icon name="clock" size={14} />
                Unsaved changes
              </p>
            ) : saved ? (
              <p
                role="status"
                className="flex items-center gap-1.5 text-[13px] text-ok"
              >
                <Icon name="check" size={14} />
                {saved}
              </p>
            ) : (
              <p className="text-[13px] text-ink-faint">
                Enter or ↓ moves to the next student.
              </p>
            )}

            <p className="ml-auto hidden text-xs text-ink-faint lg:block">
              The sheet saves as one unit: either every mark lands or none does.
            </p>
          </div>
        ) : null}
      </div>

      {error ? <FormError>{error}</FormError> : null}
    </section>
  );
}
