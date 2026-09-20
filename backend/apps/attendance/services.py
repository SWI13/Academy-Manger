"""
Writing a register, and every rate computed from one.

Rates are computed here and nowhere else. A stored attendance percentage is
the same bug as a stored average: a register corrected three weeks later
leaves a stale figure behind it, and correcting a register is expected rather
than exceptional.

The definition of the rate lives in `attendance_rate` alone, so the day
somebody decides that arriving twenty minutes late is not attendance, it is
one function that changes rather than four screens and a printed report.
"""

import logging

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.audit.models import AuditAction
from apps.audit.services import record

from .models import (
    ATTENDED_STATUSES,
    AttendanceRecord,
    AttendanceStatus,
    SessionStatus,
)

logger = logging.getLogger(__name__)


def attendance_rate(present: int, late: int, absent: int) -> float | None:
    """
    The one definition of an attendance percentage in this platform.

    Late counts as attended. Somebody who walked in twenty minutes after the
    start was in the room, and a register that scores them the same as a
    student who never came is a register a professor stops trusting.

    Returns None rather than 0 when nothing has been recorded: a course whose
    register has never been taken has no attendance rate, which is not the
    same as an attendance rate of nought.
    """
    total = present + late + absent
    if not total:
        return None
    return round(((present + late) / total) * 100, 1)


def tally(queryset) -> dict:
    """
    Count one selection of records by status, and rate it.

    One grouped query rather than three counts: this is called once per
    student on a summary of forty students, and three round trips each is a
    page that loads visibly slowly for no reason.
    """
    counts = queryset.aggregate(
        present=Count("id", filter=Q(status=AttendanceStatus.PRESENT)),
        late=Count("id", filter=Q(status=AttendanceStatus.LATE)),
        absent=Count("id", filter=Q(status=AttendanceStatus.ABSENT)),
    )
    present = counts["present"] or 0
    late = counts["late"] or 0
    absent = counts["absent"] or 0
    return {
        "present": present,
        "late": late,
        "absent": absent,
        "total": present + late + absent,
        "rate": attendance_rate(present, late, absent),
    }


def summarise_by_enrollment(records) -> list[dict]:
    """
    One row per student, from one query over their records.

    Grouped in the database rather than in Python for the same reason as
    `tally`: a term's register for a class of forty is a few thousand rows,
    and pulling them into memory to count them is work the database is better
    at and already doing.
    """
    rows = (
        records.values(
            "enrollment_id",
            "enrollment__student__public_id",
            "enrollment__student__first_name",
            "enrollment__student__last_name",
            "enrollment__course__public_id",
            "enrollment__course__title",
        )
        .annotate(
            present=Count("id", filter=Q(status=AttendanceStatus.PRESENT)),
            late=Count("id", filter=Q(status=AttendanceStatus.LATE)),
            absent=Count("id", filter=Q(status=AttendanceStatus.ABSENT)),
        )
        .order_by("enrollment__student__last_name", "enrollment__student__first_name")
    )

    summary = []
    for row in rows:
        present, late, absent = row["present"], row["late"], row["absent"]
        summary.append(
            {
                "enrollment_id": row["enrollment_id"],
                "student_public_id": row["enrollment__student__public_id"],
                "student_name": (
                    f"{row['enrollment__student__first_name']} "
                    f"{row['enrollment__student__last_name']}"
                ).strip(),
                "course_public_id": row["enrollment__course__public_id"],
                "course_title": row["enrollment__course__title"],
                "present": present,
                "late": late,
                "absent": absent,
                "total": present + late + absent,
                "rate": attendance_rate(present, late, absent),
            }
        )
    return summary


@transaction.atomic
def save_register(session, rows, *, actor) -> dict:
    """
    Write a whole register in one transaction.

    A professor marking forty names on institute Wi-Fi either saves all of
    them or none. A half-written register is the failure mode this prevents,
    and it is why the endpoint is a PUT of the whole sheet rather than forty
    PATCHes - the same shape, and for the same reason, as the mark sheet.

    `rows` is a list of {"enrollment": Enrollment, "status": str,
    "minutes_late": int | None, "note": str}. The caller validates membership.
    """
    now = timezone.now()
    created = updated = unchanged = 0

    existing = {
        record_row.enrollment_id: record_row
        for record_row in AttendanceRecord.objects.select_for_update().filter(session=session)
    }

    for row in rows:
        enrollment = row["enrollment"]
        status = row["status"]
        # Minutes are only meaningful on a late row, and the database says so
        # too. Dropping them here means a professor who marks somebody late,
        # types 10, then corrects it to present does not leave the 10 behind.
        minutes = row.get("minutes_late") if status == AttendanceStatus.LATE else None
        note = row.get("note", "")

        current = existing.get(enrollment.pk)

        if current is None:
            AttendanceRecord.objects.create(
                session=session,
                enrollment=enrollment,
                status=status,
                minutes_late=minutes,
                note=note,
                recorded_by=actor,
            )
            created += 1
            continue

        if current.status == status and current.minutes_late == minutes and current.note == note:
            unchanged += 1
            continue

        # A correction, recorded with both values. Registers do not lock (the
        # same rule as marks, D-7), so the trail is what carries the weight.
        record(
            AuditAction.ATTENDANCE_CHANGED,
            actor=actor,
            obj=session,
            old={"student": enrollment.student.public_id, "status": current.status},
            new={"student": enrollment.student.public_id, "status": status},
            label=f"{enrollment.student.public_id} {current.status} -> {status}",
        )

        current.status = status
        current.minutes_late = minutes
        current.note = note
        current.last_changed_by = actor
        current.last_changed_at = now
        current.change_count += 1
        current.save(
            update_fields=[
                "status",
                "minutes_late",
                "note",
                "last_changed_by",
                "last_changed_at",
                "change_count",
                "updated_at",
            ]
        )
        updated += 1

    # One audit row for taking the register, and one per correction above.
    # Forty rows saying "PRESENT" is not a trail anybody reads.
    if created:
        record(
            AuditAction.ATTENDANCE_TAKEN,
            actor=actor,
            obj=session,
            new={"marked": created, "held_on": session.held_on},
        )

    if session.status != SessionStatus.SUBMITTED and (created or updated):
        session.status = SessionStatus.SUBMITTED
        session.submitted_by = actor
        session.submitted_at = now
        session.save(update_fields=["status", "submitted_by", "submitted_at", "updated_at"])

    logger.info(
        "Register %s saved by %s: %d new, %d corrected",
        session.pk,
        getattr(actor, "public_id", "?"),
        created,
        updated,
    )
    return {"created": created, "updated": updated, "unchanged": unchanged}


def course_attendance(course, *, records=None) -> dict:
    """The whole course's register, tallied, with a row per student."""
    from .models import AttendanceRecord as Record

    selection = records if records is not None else Record.objects.filter(session__course=course)
    return {
        "totals": tally(selection),
        "students": summarise_by_enrollment(selection),
    }


__all__ = [
    "ATTENDED_STATUSES",
    "attendance_rate",
    "course_attendance",
    "save_register",
    "summarise_by_enrollment",
    "tally",
]
