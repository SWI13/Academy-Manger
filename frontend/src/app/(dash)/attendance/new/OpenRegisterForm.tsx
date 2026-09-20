"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDict } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FieldSet, FormActions, FormError, Note, Select } from "@/components/ui/Field";
import { ApiFailure, api } from "@/lib/api";
import type { AttendanceSession, Course } from "@/types";

/**
 * Opening a register for a class and a day.
 *
 * If somebody has already opened it, the API answers with theirs rather than
 * a uniqueness error - two people opening Tuesday's register at the same
 * moment is ordinary, and an error the professor has to interpret would send
 * them looking for a register they are already entitled to. Either way this
 * form goes to the same place, so from here the two outcomes are the same.
 */
export function OpenRegisterForm({ courses }: { courses: Course[] }) {
  const d = useDict();
  const router = useRouter();

  const [course, setCourse] = useState("");
  const [heldOn, setHeldOn] = useState(today());
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const chosen = courses.find((row) => String(row.id) === course);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const session = await api.post<AttendanceSession>("/attendance/sessions", {
        course: Number(course),
        held_on: heldOn,
        topic: topic.trim(),
      });
      router.push(`/attendance/${session.id}`);
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiFailure) {
        setFieldErrors(failure.fieldErrors());
        setError(failure.message);
      } else {
        setError(d.ui.serverUnreachable);
      }
      setBusy(false);
    }
  }

  if (!courses.length) {
    return (
      <Card>
        <Note tone="neutral" icon="info">
          {d.attendance.notOnRoster}
        </Note>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6">
      <Card>
        <FieldSet legend={d.attendance.openRegister}>
          <Select
            label={d.attendance.classLabel}
            required
            value={course}
            onChange={(event) => setCourse(event.target.value)}
            placeholder={d.ui.chooseOne}
            options={courses.map((row) => ({
              value: String(row.id),
              label: `${row.title} — ${row.public_id}`,
            }))}
            error={fieldErrors.course}
            wrapperClassName="sm:col-span-2"
          />

          <Field
            label={d.attendance.heldOn}
            type="date"
            required
            value={heldOn}
            // Bounded by the course's own dates, so the commonest mistake -
            // a register dated outside the term - is refused by the picker
            // rather than by a validation message after the fact.
            min={chosen?.start_date}
            max={chosen?.end_date}
            onChange={(event) => setHeldOn(event.target.value)}
            error={fieldErrors.held_on}
          />

          <Field
            label={d.attendance.topic}
            optional
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            hint={d.attendance.topicHint}
            error={fieldErrors.topic}
          />
        </FieldSet>
      </Card>

      {error ? <FormError>{error}</FormError> : null}

      <FormActions>
        <Button
          type="submit"
          variant="primary"
          icon="check"
          busy={busy}
          disabled={!course || !heldOn}
        >
          {d.attendance.takeRegister}
        </Button>
        <Button type="button" variant="quiet" onClick={() => router.back()} disabled={busy}>
          {d.common.cancel}
        </Button>
      </FormActions>
    </form>
  );
}

/** Today, in the yyyy-mm-dd a date input wants, in the reader's own zone. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
