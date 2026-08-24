"""
Enrollment - the hub of the whole schema.

It is the only row that knows which student is in which course at which price,
so everything time-bound about a student attaches here rather than to the
student directly: payments, marks, reviews.

The reason is reproducibility. Hang a mark off the student and the first
repeated course silently mixes this year's results with last year's. Hang it
off the enrolment and each attempt keeps its own clean history.
"""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel
from apps.courses.models import Course


class EnrollmentStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"
    SUSPENDED = "SUSPENDED", "Suspended"
    DROPPED = "DROPPED", "Dropped"


class Enrollment(TimeStampedModel):
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="enrollments"
    )
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="enrollments")

    enrolled_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=12,
        choices=EnrollmentStatus.choices,
        default=EnrollmentStatus.ACTIVE,
        db_index=True,
    )

    # The price agreed at enrolment, copied from the course and then frozen.
    # The catalogue price is a number that changes; this is a contract. A
    # balance computed from today's course price would silently rewrite last
    # term's invoices.
    price_at_enrollment_minor = models.BigIntegerField()
    currency = models.CharField(max_length=3, default="DZD")

    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "enrollments_enrollment"
        ordering = ["-enrolled_at"]
        indexes = [
            models.Index(fields=["course", "status"]),
            models.Index(fields=["student", "status"]),
        ]
        constraints = [
            # A student holds one live enrolment per course. Cancelled and
            # dropped rows are excluded, so a student who leaves and returns
            # gets a second enrolment with its own marks and payments.
            models.UniqueConstraint(
                fields=["student", "course"],
                condition=~models.Q(status__in=["CANCELLED", "DROPPED"]),
                name="uniq_live_enrollment_per_course",
            ),
            models.CheckConstraint(
                condition=models.Q(price_at_enrollment_minor__gte=0),
                name="enrollment_price_not_negative",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.student.public_id} in {self.course.public_id}"

    @property
    def is_live(self) -> bool:
        return self.status not in (EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED)
