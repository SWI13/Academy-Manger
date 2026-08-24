"""
Assessments and marks - *les notes*.

Two decisions shape this module:

The grading scale is data, not code. `max_score` lives on each assessment, so
a /20 quiz and a /100 final coexist and next term's change is a form rather
than a deploy. Averages are computed on read from raw marks and never stored,
because a stored average cannot be re-derived after the scheme changes.

Marks never lock (architecture D-7). A professor may correct a mark whenever
they need to, on any course they are assigned to. That puts the entire weight
of the control on the trail, which is why `last_changed_by`, `last_changed_at`
and `change_count` sit on the row itself rather than only in the audit log - a
mark edited a year after the course ended has to say so where people look at
marks, not only where an owner would go digging.
"""

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.core.models import TimeStampedModel
from apps.courses.models import Course
from apps.enrollments.models import Enrollment


class AssessmentKind(models.TextChoices):
    QUIZ = "QUIZ", "Quiz"
    MIDTERM = "MIDTERM", "Midterm"
    FINAL = "FINAL", "Final"
    ORAL = "ORAL", "Oral"
    HOMEWORK = "HOMEWORK", "Homework"
    PARTICIPATION = "PARTICIPATION", "Participation"


class Assessment(TimeStampedModel):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="assessments")

    title = models.CharField(max_length=200)
    kind = models.CharField(
        max_length=16, choices=AssessmentKind.choices, default=AssessmentKind.QUIZ
    )

    # The scale, per assessment. Algerian institutes commonly mark out of 20,
    # so that is the default - but it is a default, not a rule.
    max_score = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("20.00"))

    # Contribution to the course average. Relative, not a percentage: three
    # assessments weighted 1, 1, 2 make the last one worth half the course
    # without anyone having to make the numbers add to 100.
    weight = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("1.00"))

    held_on = models.DateField(null=True, blank=True)

    # Marks exist before students may see them. Publishing is what makes a
    # mark visible to the student it belongs to.
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "assessments_assessment"
        ordering = ["held_on", "title"]
        indexes = [models.Index(fields=["course", "held_on"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(max_score__gt=0), name="assessment_max_score_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(weight__gte=0), name="assessment_weight_not_negative"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.course.public_id} {self.title}"

    @property
    def marked_count(self) -> int:
        return self.scores.count()


class AssessmentScore(TimeStampedModel):
    """
    One student's mark for one assessment.

    Attached to the enrolment, not the student: the enrolment already names
    both the student and the course, so a mark for someone not enrolled is
    unrepresentable, and a student who retakes a course gets a second
    enrolment with its own clean set of marks.
    """

    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name="scores")
    enrollment = models.ForeignKey(Enrollment, on_delete=models.PROTECT, related_name="scores")

    score = models.DecimalField(max_digits=6, decimal_places=2)
    comment = models.CharField(max_length=500, blank=True)

    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    entered_at = models.DateTimeField(auto_now_add=True)

    # Marks never lock, so the row carries its own edit history. Without this,
    # "changeable forever" quietly becomes "changeable invisibly".
    last_changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    last_changed_at = models.DateTimeField(null=True, blank=True)
    change_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "assessments_score"
        constraints = [
            # One mark per student per assessment. The constraint is also what
            # makes a double-submit on flaky institute Wi-Fi safe.
            models.UniqueConstraint(
                fields=["assessment", "enrollment"], name="uniq_score_per_enrollment"
            ),
            models.CheckConstraint(condition=models.Q(score__gte=0), name="score_not_negative"),
        ]
        indexes = [models.Index(fields=["enrollment"])]

    def __str__(self) -> str:
        return f"{self.enrollment.student.public_id} {self.score}/{self.assessment.max_score}"

    def clean(self):
        if self.score is not None and self.assessment_id:
            if self.score > self.assessment.max_score:
                raise ValidationError(
                    {"score": f"Score cannot exceed {self.assessment.max_score}."}
                )

    @property
    def percentage(self) -> Decimal:
        return (self.score / self.assessment.max_score) * 100

    @property
    def was_edited(self) -> bool:
        return self.change_count > 0
