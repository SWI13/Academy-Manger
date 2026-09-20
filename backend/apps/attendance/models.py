"""
Who was in the room.

Two tables, and the shape of them is the whole design:

`AttendanceSession` is one register - one course, on one date. It is opened,
filled in, and submitted. Opening it is a deliberate act, so an empty register
means "nobody has taken it yet" rather than "everybody was absent", and those
two are not the same thing to a parent asking why their child is marked away.

`AttendanceRecord` hangs off an `Enrollment`, not off a student. That is the
same decision `Payment` makes and for the same reason: a record cannot be
written for somebody who is not on the course, and the roster the register
offers is the roster by construction rather than by a validation rule someone
has to remember.

---------------------------------------------------------------------------
Three states, and what the percentage does with them
---------------------------------------------------------------------------
PRESENT, ABSENT, LATE - the three the requirement names, and no others.

The attendance rate is `(present + late) / total`, which is to say late
counts as attended. That is a policy, it is one somebody will eventually want
changed, and it lives in `services.attendance_rate` alone so that changing it
is one function rather than a search through the templates.

---------------------------------------------------------------------------
Correcting a register
---------------------------------------------------------------------------
Registers do not lock, for the same reason marks do not (architecture D-7): a
professor who marked the wrong row has to be able to fix it, and a system that
refuses gets a phone call instead of a correction. The weight is on the trail -
`last_changed_by`, `last_changed_at` and `change_count` sit on the row, where
somebody reading the register can see that a mark was changed and by whom.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.core.models import TimeStampedModel
from apps.courses.models import Course
from apps.enrollments.models import Enrollment
from apps.schedules.models import Schedule


class AttendanceStatus(models.TextChoices):
    PRESENT = "PRESENT", "Present"
    ABSENT = "ABSENT", "Absent"
    LATE = "LATE", "Late"


#: What counts as having attended, for every rate this platform reports.
ATTENDED_STATUSES = frozenset({AttendanceStatus.PRESENT, AttendanceStatus.LATE})


class SessionStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    SUBMITTED = "SUBMITTED", "Submitted"


class AttendanceSession(TimeStampedModel):
    """One register: one course, one date."""

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="attendance_sessions")

    held_on = models.DateField(db_index=True)

    # Which weekly slot this register belongs to, when the course has more
    # than one. Nullable and SET_NULL: a register is a fact about a day, and
    # it must survive the timetable being rewritten next term.
    schedule = models.ForeignKey(
        Schedule,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="attendance_sessions",
    )

    status = models.CharField(
        max_length=12, choices=SessionStatus.choices, default=SessionStatus.OPEN, db_index=True
    )

    topic = models.CharField(
        max_length=200, blank=True, help_text="What was covered, if it is worth recording."
    )
    notes = models.TextField(blank=True)

    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "attendance_session"
        ordering = ["-held_on", "-created_at"]
        indexes = [models.Index(fields=["course", "-held_on"])]
        constraints = [
            # One register per course per day. Two registers for the same
            # morning is two answers to whether a student was there, and
            # whichever the report happens to read is the one that wins.
            models.UniqueConstraint(
                fields=["course", "held_on"], name="uniq_attendance_session_per_day"
            ),
            models.CheckConstraint(
                condition=~models.Q(status="SUBMITTED") | models.Q(submitted_at__isnull=False),
                name="submitted_register_has_a_timestamp",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.course.public_id} {self.held_on:%Y-%m-%d}"

    def clean(self):
        if self.schedule_id and self.schedule.course_id != self.course_id:
            raise ValidationError({"schedule": "That slot belongs to another course."})
        if self.held_on and self.course_id:
            course = self.course
            if self.held_on < course.start_date or self.held_on > course.end_date:
                raise ValidationError(
                    {"held_on": "That date is outside the course's own start and end dates."}
                )

    # Deliberately no `marked_count` property here. The viewset annotates one
    # onto the queryset, and a read-only property of the same name makes every
    # fetch of that queryset raise "property has no setter" - which is a very
    # confusing 500 for what is really a naming collision.


class AttendanceRecord(TimeStampedModel):
    """One student, on one register."""

    session = models.ForeignKey(AttendanceSession, on_delete=models.CASCADE, related_name="records")
    # The enrolment, not the student - so a record cannot exist for somebody
    # who is not on the course. See the module docstring.
    enrollment = models.ForeignKey(
        Enrollment, on_delete=models.CASCADE, related_name="attendance_records"
    )

    status = models.CharField(max_length=8, choices=AttendanceStatus.choices, db_index=True)

    # Only meaningful on a LATE row, and left null rather than zero when
    # nobody wrote it down - zero minutes late is on time.
    minutes_late = models.PositiveIntegerField(null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)

    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    last_changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    last_changed_at = models.DateTimeField(null=True, blank=True)
    # On the row rather than only in the audit log: a register corrected three
    # weeks later has to say so where people read registers, not only where an
    # owner would go digging.
    change_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "attendance_record"
        ordering = ["enrollment__student__last_name", "enrollment__student__first_name"]
        indexes = [
            models.Index(fields=["enrollment", "status"]),
            models.Index(fields=["session", "status"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["session", "enrollment"], name="uniq_attendance_record_per_student"
            ),
            models.CheckConstraint(
                condition=models.Q(status="LATE") | models.Q(minutes_late__isnull=True),
                name="only_a_late_record_carries_minutes",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.session_id}:{self.enrollment_id} {self.status}"

    @property
    def counts_as_attended(self) -> bool:
        return self.status in ATTENDED_STATUSES

    @property
    def was_corrected(self) -> bool:
        return self.change_count > 0
