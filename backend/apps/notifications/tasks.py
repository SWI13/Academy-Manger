"""
Scheduled notification work.

Two beat jobs. Both are idempotent: beat can fire twice after a restart, and a
professor receiving tomorrow's class reminder twice is the kind of noise that
makes people mute notifications entirely.
"""

import logging
from datetime import date, timedelta

from celery import shared_task
from django.db.models import Count

from apps.courses.models import AssignmentStatus, CourseProfessor
from apps.enrollments.models import Enrollment, EnrollmentStatus
from apps.schedules.models import Schedule, ScheduleStatus

from .models import Notification, NotificationKind
from .services import notify

logger = logging.getLogger(__name__)


@shared_task(name="notifications.send_session_reminders")
def send_session_reminders() -> dict:
    """
    Tell each professor about tomorrow's classes, with the head-count.

    Runs the evening before. A professor who teaches twice a week will not
    open the platform to check whether anything changed, so the second of
    their two jobs only works if it arrives at them.
    """
    tomorrow = date.today() + timedelta(days=1)
    sent = skipped = 0

    slots = Schedule.objects.filter(
        status=ScheduleStatus.ACTIVE, weekday=tomorrow.weekday()
    ).select_related("course")

    counts = {
        row["course"]: row["n"]
        for row in Enrollment.objects.exclude(
            status__in=[EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED]
        )
        .values("course")
        .annotate(n=Count("id"))
    }

    for slot in slots:
        if not (slot.window_start <= tomorrow <= slot.window_end):
            continue

        professors = CourseProfessor.objects.filter(
            course=slot.course, status=AssignmentStatus.ACTIVE
        ).select_related("professor")

        for assignment in professors:
            # Idempotent: beat can fire twice after a restart, and a duplicate
            # reminder is exactly the noise that gets notifications muted.
            already = Notification.objects.filter(
                recipient=assignment.professor,
                kind=NotificationKind.SESSION_REMINDER,
                target_type="Schedule",
                target_id=str(slot.pk),
                created_at__date=date.today(),
            ).exists()
            if already:
                skipped += 1
                continue

            head_count = counts.get(slot.course_id, 0)
            room = f" in {slot.room}" if slot.room else ""
            if notify(
                assignment.professor,
                NotificationKind.SESSION_REMINDER,
                f"{slot.course.title} tomorrow at {slot.start_time:%H:%M}",
                (
                    f"{slot.course.title} ({slot.course.public_id}) is tomorrow, "
                    f"{slot.start_time:%H:%M}-{slot.end_time:%H:%M}{room}. "
                    f"{head_count} student{'s' if head_count != 1 else ''} enrolled."
                ),
                target=slot,
                link_path="/dashboard",
            ):
                sent += 1

    logger.info("Session reminders: %d sent, %d already sent", sent, skipped)
    return {"sent": sent, "skipped": skipped}


@shared_task(name="notifications.send_roster_digests")
def send_roster_digests() -> dict:
    """
    One message a day per professor summarising class-list changes.

    Deliberately a digest rather than an event. During an enrolment week a
    per-enrolment notification would mean forty messages, which professors
    would mute - and a muted channel is the same as an unbuilt one.
    """
    since = date.today() - timedelta(days=1)
    sent = 0

    assignments = (
        CourseProfessor.objects.filter(status=AssignmentStatus.ACTIVE)
        .select_related("professor", "course")
        .order_by("professor_id")
    )

    by_professor: dict[int, list] = {}
    for assignment in assignments:
        by_professor.setdefault(assignment.professor_id, []).append(assignment)

    for entries in by_professor.values():
        professor = entries[0].professor
        lines = []

        for assignment in entries:
            joined = (
                Enrollment.objects.filter(course=assignment.course, enrolled_at__date__gte=since)
                .exclude(status__in=[EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED])
                .count()
            )
            left = Enrollment.objects.filter(
                course=assignment.course,
                updated_at__date__gte=since,
                status__in=[EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED],
            ).count()

            if joined or left:
                changes = []
                if joined:
                    changes.append(f"{joined} joined")
                if left:
                    changes.append(f"{left} left")
                lines.append(f"{assignment.course.title}: {', '.join(changes)}")

        if not lines:
            continue

        if notify(
            professor,
            NotificationKind.ROSTER_CHANGED,
            "Your class lists changed",
            "\n".join(lines),
            link_path="/dashboard",
        ):
            sent += 1

    logger.info("Roster digests: %d sent", sent)
    return {"sent": sent}
