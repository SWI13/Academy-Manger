"""
Courses and professor assignment.

A course is a catalogue entry: what is taught, when it runs, what it costs
today. What a particular student agreed to pay is on their Enrollment, not
here - see enrollments.models for why that distinction is load-bearing.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.core.identifiers import next_course_identifier
from apps.core.models import TimeStampedModel


class CourseStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ACTIVE = "ACTIVE", "Active"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"
    ARCHIVED = "ARCHIVED", "Archived"


class AssignmentRole(models.TextChoices):
    LEAD = "LEAD", "Lead"
    ASSISTANT = "ASSISTANT", "Assistant"


class AssignmentStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    ENDED = "ENDED", "Ended"


class Course(TimeStampedModel):
    public_id = models.CharField(max_length=16, unique=True, editable=False)

    title = models.CharField(max_length=200, db_index=True)
    description = models.TextField(blank=True)

    start_date = models.DateField()
    end_date = models.DateField()

    # Catalogue price. Integer minor units plus a currency, never a float.
    price_minor = models.BigIntegerField(default=0)
    currency = models.CharField(max_length=3, default="DZD")

    capacity = models.PositiveIntegerField(
        null=True, blank=True, help_text="Maximum enrolments. Blank means uncapped."
    )

    status = models.CharField(
        max_length=12, choices=CourseStatus.choices, default=CourseStatus.DRAFT, db_index=True
    )
    archived_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    professors = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="CourseProfessor",
        # CourseProfessor points at User twice - the professor, and whoever
        # made the assignment. Name which one this relation follows.
        through_fields=("course", "professor"),
        related_name="courses_taught",
    )

    class Meta:
        db_table = "courses_course"
        ordering = ["-start_date", "title"]
        indexes = [models.Index(fields=["status", "start_date"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_date__gte=models.F("start_date")),
                name="course_ends_after_it_starts",
            ),
            models.CheckConstraint(
                condition=models.Q(price_minor__gte=0), name="course_price_not_negative"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.public_id} {self.title}"

    def save(self, *args, **kwargs):
        if not self.public_id:
            # Year-scoped: C-2026-001 restarts each January, which is what
            # staff expect when they read an ID aloud.
            self.public_id = next_course_identifier(self.start_date.year)
        super().save(*args, **kwargs)

    def clean(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({"end_date": "A course cannot end before it starts."})

    @property
    def is_open_for_enrollment(self) -> bool:
        return self.status in (CourseStatus.DRAFT, CourseStatus.ACTIVE)

    @property
    def seats_taken(self) -> int:
        from apps.enrollments.models import EnrollmentStatus

        return self.enrollments.exclude(
            status__in=[EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED]
        ).count()

    @property
    def seats_remaining(self) -> int | None:
        if self.capacity is None:
            return None
        return max(self.capacity - self.seats_taken, 0)


class CourseProfessor(TimeStampedModel):
    """
    A course can have more than one professor - a lead and an assistant is
    ordinary. This is also the table the professor scope reads: an ACTIVE row
    here is what lets a professor reach a course at all.
    """

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="assignments")
    professor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="course_assignments"
    )

    assignment_role = models.CharField(
        max_length=12, choices=AssignmentRole.choices, default=AssignmentRole.LEAD
    )
    status = models.CharField(
        max_length=8, choices=AssignmentStatus.choices, default=AssignmentStatus.ACTIVE
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "courses_course_professor"
        constraints = [
            # One active assignment per professor per course. The same
            # professor can be assigned again later after being unassigned.
            models.UniqueConstraint(
                fields=["course", "professor"],
                condition=models.Q(status="ACTIVE"),
                name="uniq_active_course_professor",
            )
        ]
        indexes = [models.Index(fields=["professor", "status"])]

    def __str__(self) -> str:
        return f"{self.course_id}:{self.professor_id}"
