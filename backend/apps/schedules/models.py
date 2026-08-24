"""
Schedules.

A recurring weekly pattern, not dated sessions - architecture D-3. "Monday
17:00-19:00 in Room A-102" is one row that covers a whole term, rather than
fourteen rows that have to be generated and kept in step.

What this deliberately does not model: a single cancelled session, or a
one-week room move. Those need a second table and were left out of the MVP.
`next_occurrence` resolves the pattern into a concrete date when a professor
asks what is next.
"""

from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel
from apps.courses.models import Course


class Weekday(models.IntegerChoices):
    """Monday is 0, matching Python's date.weekday()."""

    MONDAY = 0, "Monday"
    TUESDAY = 1, "Tuesday"
    WEDNESDAY = 2, "Wednesday"
    THURSDAY = 3, "Thursday"
    FRIDAY = 4, "Friday"
    SATURDAY = 5, "Saturday"
    SUNDAY = 6, "Sunday"


class ScheduleStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    SUSPENDED = "SUSPENDED", "Suspended"
    ENDED = "ENDED", "Ended"


class Schedule(TimeStampedModel):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="schedules")

    # Nullable: a slot belongs to the course, and the professor who teaches it
    # is normally whoever the course is assigned to. Set it only when a
    # specific slot is taught by a specific person.
    professor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="teaching_slots",
    )

    weekday = models.IntegerField(choices=Weekday.choices, db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    room = models.CharField(max_length=50, blank=True)

    # Bound the pattern. Blank means "for the whole course", resolved against
    # the course dates.
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)

    status = models.CharField(
        max_length=10, choices=ScheduleStatus.choices, default=ScheduleStatus.ACTIVE
    )
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "schedules_schedule"
        ordering = ["weekday", "start_time"]
        indexes = [models.Index(fields=["course", "weekday"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")),
                name="schedule_ends_after_it_starts",
            )
        ]

    def __str__(self) -> str:
        return f"{self.get_weekday_display()} {self.start_time:%H:%M}-{self.end_time:%H:%M}"

    @property
    def window_start(self) -> date:
        return self.effective_from or self.course.start_date

    @property
    def window_end(self) -> date:
        return self.effective_to or self.course.end_date

    def overlaps(self, other: "Schedule") -> bool:
        """Same weekday and clashing times, within overlapping date windows."""
        if self.weekday != other.weekday:
            return False
        if self.start_time >= other.end_time or other.start_time >= self.end_time:
            return False
        return not (self.window_end < other.window_start or other.window_end < self.window_start)

    def next_occurrence(self, *, on_or_after: date | None = None) -> datetime | None:
        """
        Resolve the recurring pattern into the next concrete date and time.

        Returns None once the pattern's window has passed - which is what a
        professor's "what is next" screen shows when a course has finished.
        """
        today = on_or_after or date.today()
        start = max(today, self.window_start)

        days_ahead = (self.weekday - start.weekday()) % 7
        occurrence = start + timedelta(days=days_ahead)

        if occurrence > self.window_end:
            return None
        return datetime.combine(occurrence, self.start_time or time(0, 0))
