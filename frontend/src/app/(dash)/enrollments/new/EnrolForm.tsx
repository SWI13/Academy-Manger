"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  FormActions,
  FormError,
  Note,
  Select,
  TextArea,
} from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Stars";
import { useToast } from "@/components/ui/Toast";
import { ApiFailure, api } from "@/lib/api";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { Course, Enrollment, User } from "@/types";
import { useDict } from "@/components/LocaleProvider";

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
  const d = useDict();
  const router = useRouter();
  const toast = useToast();

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

  const full = course?.capacity != null && course.seats_taken >= course.capacity;

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
      toast({
        tone: "ok",
        title: d.enrollments.enrolled,
        description: `${student?.full_name ?? "The student"} is on ${
          course?.title ?? "the course"
        }.`,
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
      <Card>
        <Note tone="neutral">
          No course is open for enrolment. A course accepts students while it is
          a draft or active; a completed or archived one does not.
        </Note>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-6">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={d.filters.student}
            required
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            placeholder={d.enrollments.chooseStudent}
            options={students.map((row) => ({
              value: row.public_id,
              label: `${row.full_name} — ${row.public_id}`,
            }))}
            error={fieldErrors.student_public_id}
            hint={d.enrollments.chooseStudentHint}
          />

          <Select
            label={d.filters.course}
            required
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            placeholder={d.enrollments.chooseCourse}
            options={courses.map((row) => ({
              value: row.public_id,
              label: `${row.title} — ${row.public_id}`,
            }))}
            error={fieldErrors.course_public_id}
            hint={d.enrollments.chooseCourseHint}
          />

          <TextArea
            label={d.payments.notes}
            optional
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={d.enrollments.notesPlaceholder}
            wrapperClassName="sm:col-span-2"
          />
        </div>
      </Card>

      {/* --- what will actually be written ---------------------------- */}
      {course ? (
        <Card className="animate-rise">
          <p className="eyebrow">{d.enrollments.whatWillBeRecorded}</p>

          <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-faint">{d.filters.student}</dt>
              <dd className="mt-1 text-sm font-medium text-ink">
                {student ? student.full_name : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">{d.enrollments.courseRuns}</dt>
              <dd className="tabular mt-1 text-sm text-ink">
                {formatDate(course.start_date)} — {formatDate(course.end_date)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">{d.enrollments.priceFrozen}</dt>
              <dd className="tabular mt-1 text-lg font-semibold text-ink">
                {course.price_minor === undefined
                  ? "—"
                  : formatMoney(course.price_minor, course.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">{d.courses.seats}</dt>
              <dd className="tabular mt-1 text-sm text-ink">
                {formatNumber(course.seats_taken)}
                {course.capacity
                  ? ` of ${formatNumber(course.capacity)}`
                  : " enrolled, uncapped"}
              </dd>
              {course.capacity ? (
                <Meter
                  value={course.seats_taken}
                  max={course.capacity}
                  tone={full ? "warn" : "accent"}
                  label={`${course.seats_taken} of ${course.capacity} seats taken`}
                  className="mt-2 max-w-40"
                />
              ) : null}
            </div>
          </dl>

          <p className="mt-5 flex items-start gap-2 border-t border-rule pt-4 text-[13px] leading-relaxed text-ink-faint">
            <Icon name="lock" size={15} className="mt-px shrink-0" />
            The price is copied from the course now and stays on this enrolment.
            Changing the catalogue price later will not alter it.
          </p>
        </Card>
      ) : null}

      {alreadyEnrolled ? (
        <Note tone="warn">
          That student already has a live enrolment on this course. Cancel the
          existing one first if they are starting again.
        </Note>
      ) : null}

      {full ? (
        <Note tone="warn">
          {course?.public_id} is full ({formatNumber(course?.capacity)} seats).
        </Note>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      <FormActions note={d.enrollments.notesHint}>
        <Button
          type="submit"
          variant="primary"
          busy={busy}
          disabled={!studentId || !courseId || alreadyEnrolled || full}
        >{d.enrollments.submit}</Button>
      </FormActions>
    </form>
  );
}
