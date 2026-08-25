"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ApiFailure, api } from "@/lib/api";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Course, Enrollment, User } from "@/types";

/**
 * Putting a student on a course.
 *
 * Two things the form does not have, and both are deliberate.
 *
 * There is no price field. The price is copied from the course at the moment
 * the enrolment is made and frozen there - a price the desk can type is a
 * discount anyone can grant. The form shows what will be frozen so nobody is
 * surprised by it.
 *
 * There is no status field. Every enrolment starts active and moves by a
 * named change afterwards, so the trail of who suspended or cancelled it
 * exists.
 */
export function EnrolForm({
  students,
  courses,
  existing,
}: {
  students: User[];
  courses: Course[];
  existing: Enrollment[];
}) {
  const router = useRouter();

  const [studentId, setStudentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const course = courses.find((row) => row.public_id === courseId) ?? null;
  const student = students.find((row) => row.public_id === studentId) ?? null;

  // Caught here as well as by the server, so the desk finds out before
  // pressing the button rather than after. The server refuses it regardless -
  // this is a courtesy, not the check.
  const alreadyEnrolled = useMemo(
    () =>
      Boolean(
        studentId &&
          courseId &&
          existing.some(
            (row) =>
              row.student.public_id === studentId &&
              row.course_public_id === courseId,
          ),
      ),
    [studentId, courseId, existing],
  );

  const full =
    course?.capacity != null && course.seats_taken >= course.capacity;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const created = await api.post<Enrollment>("/enrollments", {
        student_public_id: studentId,
        course_public_id: courseId,
        notes: notes.trim(),
      });
      router.push(`/enrollments/${created.id}`);
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiFailure) {
        setFieldErrors(failure.fieldErrors());
        setError(failure.message);
      } else {
        setError("Could not reach the server.");
      }
      setBusy(false);
    }
  }

  if (!courses.length) {
    return (
      <p className="rounded border border-rule bg-surface px-4 py-8 text-sm text-ink-soft">
        No course is open for enrolment. A course accepts students while it is a
        draft or active; a completed or archived one does not.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Student</span>
          <select
            required
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            className="rounded border border-rule-strong bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">Choose a student</option>
            {students.map((row) => (
              <option key={row.public_id} value={row.public_id}>
                {row.full_name} — {row.public_id}
              </option>
            ))}
          </select>
          {fieldErrors.student_public_id ? (
            <span className="text-sm text-bad">{fieldErrors.student_public_id}</span>
          ) : (
            <span className="text-sm text-ink-faint">
              Active student accounts only.
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Course</span>
          <select
            required
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            className="rounded border border-rule-strong bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">Choose a course</option>
            {courses.map((row) => (
              <option key={row.public_id} value={row.public_id}>
                {row.title} — {row.public_id}
              </option>
            ))}
          </select>
          {fieldErrors.course_public_id ? (
            <span className="text-sm text-bad">{fieldErrors.course_public_id}</span>
          ) : (
            <span className="text-sm text-ink-faint">
              Draft and active courses accept enrolments.
            </span>
          )}
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Notes (optional)</span>
        <textarea
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="rounded border border-rule-strong bg-surface px-3 py-2 text-sm text-ink"
          placeholder="Paying in three instalments; sibling of STU-000004."
        />
      </label>

      {course ? (
        <section className="rounded border border-rule bg-surface p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            What will be recorded
          </h2>
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-faint">Student</dt>
              <dd className="text-sm text-ink">
                {student ? student.full_name : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">Course runs</dt>
              <dd className="text-sm text-ink">
                {formatDate(course.start_date)} — {formatDate(course.end_date)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">Price, frozen at enrolment</dt>
              <dd className="tabular text-sm font-medium text-ink">
                {course.price_minor === undefined
                  ? "—"
                  : formatMoney(course.price_minor, course.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">Seats</dt>
              <dd className="tabular text-sm text-ink">
                {formatNumber(course.seats_taken)}
                {course.capacity ? ` of ${formatNumber(course.capacity)}` : " enrolled, uncapped"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-rule pt-3 text-xs text-ink-faint">
            The price is copied from the course now and stays on this enrolment.
            Changing the catalogue price later will not alter it.
          </p>
        </section>
      ) : null}

      {alreadyEnrolled ? (
        <p className="rounded border border-warn/30 bg-warn-wash px-3 py-2 text-sm text-warn">
          That student already has a live enrolment on this course. Cancel the
          existing one first if they are starting again.
        </p>
      ) : null}

      {full ? (
        <p className="rounded border border-warn/30 bg-warn-wash px-3 py-2 text-sm text-warn">
          {course?.public_id} is full ({formatNumber(course?.capacity)} seats).
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded border border-bad/30 bg-bad-wash px-3 py-2 text-sm text-bad"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          busy={busy}
          disabled={!studentId || !courseId || alreadyEnrolled || full}
        >
          Enrol student
        </Button>
        <p className="text-sm text-ink-faint">
          They are notified, and the enrolment starts active.
        </p>
      </div>
    </form>
  );
}
