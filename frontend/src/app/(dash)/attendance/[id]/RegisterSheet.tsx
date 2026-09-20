"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useDict, useFill } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormActions, FormError } from "@/components/ui/Field";
import { Figure } from "@/components/ui/StatTile";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { AttendanceTally, RosterRow } from "@/types";

/**
 * Marking a class.
 *
 * A PUT of the whole sheet, exactly like the mark sheet, and for the same
 * reason: a professor marking forty names on institute Wi-Fi either saves all
 * of them or none. A half-written register is the failure mode this avoids.
 *
 * The three buttons per row rather than a dropdown is a deliberate trade of
 * screen space for speed - taking a register is forty decisions in ninety
 * seconds, and a select that has to be opened, read and closed is three
 * interactions where a tap should be one.
 *
 * The counts under the table are this screen's own, of what is on this
 * screen, and are labelled as the sheet rather than as the course. The rate
 * over a period is the backend's and lives on the summary; nothing here tries
 * to compute one.
 */
type Mark = { status: string; minutes: string; note: string };

export function RegisterSheet({
  sessionId,
  rows,
  totals,
  mayRecord,
}: {
  sessionId: number;
  rows: RosterRow[];
  totals: AttendanceTally;
  mayRecord: boolean;
}) {
  const d = useDict();
  const t = useFill();
  const router = useRouter();
  const toast = useToast();

  const [marks, setMarks] = useState<Record<number, Mark>>(() =>
    Object.fromEntries(
      rows.map((row) => [
        row.enrollment,
        {
          status: row.status ?? "",
          minutes: row.minutes_late ? String(row.minutes_late) : "",
          note: row.note ?? "",
        },
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tally = useMemo(() => {
    const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, unmarked: 0 };
    for (const row of rows) {
      const status = marks[row.enrollment]?.status;
      if (status === "PRESENT") counts.PRESENT += 1;
      else if (status === "LATE") counts.LATE += 1;
      else if (status === "ABSENT") counts.ABSENT += 1;
      else counts.unmarked += 1;
    }
    return counts;
  }, [marks, rows]);

  function mark(enrollment: number, status: string) {
    setMarks((current) => ({
      ...current,
      [enrollment]: {
        ...current[enrollment],
        // Tapping the mark a row already has clears it, so a mis-tap is one
        // tap to undo rather than a state nobody can get out of.
        status: current[enrollment]?.status === status ? "" : status,
        // Minutes only mean anything on a late row. Dropped here as well as
        // on the server, so the box disappears when the mark changes.
        minutes: status === "LATE" ? current[enrollment]?.minutes ?? "" : "",
      },
    }));
  }

  function setAll(status: string) {
    setMarks((current) =>
      Object.fromEntries(
        rows.map((row) => [
          row.enrollment,
          { ...current[row.enrollment], status, minutes: "" },
        ]),
      ),
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.put<{ created: number; updated: number }>(
        `/attendance/sessions/${sessionId}/register`,
        {
          // Unmarked rows are left out entirely. An empty register means
          // nobody has taken it, which is not the same as everybody absent -
          // so a blank row must not become an ABSENT one by omission.
          rows: rows
            .filter((row) => marks[row.enrollment]?.status)
            .map((row) => ({
              enrollment: row.enrollment,
              status: marks[row.enrollment].status,
              minutes_late:
                marks[row.enrollment].status === "LATE" && marks[row.enrollment].minutes
                  ? Number(marks[row.enrollment].minutes)
                  : null,
              note: marks[row.enrollment].note.trim(),
            })),
        },
      );
      toast({
        tone: "ok",
        title: d.attendance.saved,
        description: t(d.attendance.savedDetail, {
          created: result.created,
          updated: result.updated,
        }),
      });
      router.refresh();
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : d.ui.serverUnreachable);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card padded={false} solid className="overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule bg-black/40">
              <th className="eyebrow px-4 py-2.5 text-start">{d.columns.name}</th>
              <th className="eyebrow px-2 py-2.5 text-center" style={{ width: "1%" }}>
                {d.attendance.present}
              </th>
              <th className="eyebrow px-2 py-2.5 text-center" style={{ width: "1%" }}>
                {d.attendance.late}
              </th>
              <th className="eyebrow px-2 py-2.5 text-center" style={{ width: "1%" }}>
                {d.attendance.absent}
              </th>
              <th className="eyebrow px-4 py-2.5 text-start" style={{ width: "22%" }}>
                {d.attendance.note}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const entry = marks[row.enrollment];
              return (
                <tr key={row.enrollment} className="border-b border-rule last:border-b-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink">{row.student_name}</p>
                    <p className="tabular text-xs text-ink-faint">
                      {row.student_public_id}
                    </p>
                  </td>
                  {(["PRESENT", "LATE", "ABSENT"] as const).map((status) => (
                    <td key={status} className="px-2 py-2.5 text-center">
                      <MarkButton
                        status={status}
                        active={entry?.status === status}
                        disabled={!mayRecord}
                        onClick={() => mark(row.enrollment, status)}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {entry?.status === "LATE" ? (
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          disabled={!mayRecord}
                          value={entry.minutes}
                          onChange={(event) =>
                            setMarks((current) => ({
                              ...current,
                              [row.enrollment]: {
                                ...current[row.enrollment],
                                minutes: event.target.value,
                              },
                            }))
                          }
                          placeholder={d.attendance.minutesLate}
                          aria-label={d.attendance.minutesLate}
                          className="h-8 w-20 rounded-md border border-rule-strong bg-black/40 px-2 text-xs text-ink"
                        />
                      ) : null}
                      <input
                        type="text"
                        disabled={!mayRecord}
                        value={entry?.note ?? ""}
                        onChange={(event) =>
                          setMarks((current) => ({
                            ...current,
                            [row.enrollment]: {
                              ...current[row.enrollment],
                              note: event.target.value,
                            },
                          }))
                        }
                        aria-label={d.attendance.note}
                        className="h-8 min-w-0 flex-1 rounded-md border border-rule-strong bg-black/40 px-2 text-xs text-ink"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label={d.attendance.present} value={formatNumber(tally.PRESENT)} tone="ok" />
          <Figure
            label={d.attendance.late}
            value={formatNumber(tally.LATE)}
            tone={tally.LATE ? "warn" : "plain"}
          />
          <Figure
            label={d.attendance.absent}
            value={formatNumber(tally.ABSENT)}
            tone={tally.ABSENT ? "bad" : "plain"}
          />
          <Figure
            label={d.attendance.roster}
            value={formatNumber(rows.length)}
            note={
              tally.unmarked
                ? `${formatNumber(tally.unmarked)} ${d.attendance.noRate.toLowerCase()}`
                : undefined
            }
          />
        </dl>
        {totals.total > 0 ? (
          <p className="mt-4 border-t border-rule pt-3 text-xs text-ink-faint">
            {d.attendance.rate}: {totals.rate === null ? "—" : `${totals.rate}%`}
          </p>
        ) : null}
      </Card>

      {error ? <FormError>{error}</FormError> : null}

      {mayRecord ? (
        <FormActions note={d.attendance.blankSheet}>
          <Button
            variant="primary"
            icon="check"
            busy={busy}
            onClick={save}
            disabled={tally.unmarked === rows.length}
          >
            {d.attendance.saveRegister}
          </Button>
          <Button variant="quiet" onClick={() => setAll("PRESENT")} disabled={busy}>
            {d.attendance.markAllPresent}
          </Button>
          <Button variant="quiet" onClick={() => setAll("")} disabled={busy}>
            {d.attendance.clearAll}
          </Button>
        </FormActions>
      ) : null}
    </div>
  );
}

/**
 * One of the three marks.
 *
 * Colour is never the only signal - each button carries its own letter, so the
 * register is readable in monochrome and to a red-green colour blindness, the
 * same rule the status badges follow.
 */
function MarkButton({
  status,
  active,
  disabled,
  onClick,
}: {
  status: "PRESENT" | "LATE" | "ABSENT";
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const d = useDict();
  const tone = {
    PRESENT: "border-ok-line bg-ok-wash text-ok",
    LATE: "border-warn-line bg-warn-wash text-warn",
    ABSENT: "border-bad-line bg-bad-wash text-bad",
  }[status];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={(d.status as Record<string, string>)[status]}
      className={`inline-flex size-8 items-center justify-center rounded-md border text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? tone : "border-rule text-ink-faint hover:border-rule-strong hover:text-ink"
      }`}
    >
      {(d.status as Record<string, string>)[status]?.charAt(0) ?? status.charAt(0)}
    </button>
  );
}
