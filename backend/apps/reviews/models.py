"""
Course reviews.

Attached to the enrolment, not to the student and course separately
(architecture D-2). That single choice does three things a permission check
would otherwise have to do by hand: it makes "only someone who took this
course may review it" a foreign key, it gives "one review per attempt" a
unique constraint, and it keeps a retaken course's second review distinct
from the first.

Nothing here is deleted. A review that should not be public is HIDDEN or
REJECTED by a moderator, and the row - with who moderated it and when -
stays. The alternative is a moderation feature whose effect cannot itself be
reviewed.
"""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel
from apps.enrollments.models import Enrollment

MIN_RATING = 1
MAX_RATING = 5


class ReviewStatus(models.TextChoices):
    PENDING = "PENDING", "Awaiting moderation"
    APPROVED = "APPROVED", "Approved"
    HIDDEN = "HIDDEN", "Hidden"
    REJECTED = "REJECTED", "Rejected"


# Once a moderator has ruled, the student no longer edits the text. Before
# that they may still correct it - the same rule payments follow: editable
# until somebody has acted on it, immutable afterwards.
MODERATED_STATUSES = frozenset({ReviewStatus.APPROVED, ReviewStatus.HIDDEN, ReviewStatus.REJECTED})


class Review(TimeStampedModel):
    enrollment = models.OneToOneField(Enrollment, on_delete=models.PROTECT, related_name="review")

    rating = models.PositiveSmallIntegerField(help_text="1 to 5.")
    comment = models.TextField(blank=True)

    status = models.CharField(
        max_length=10, choices=ReviewStatus.choices, default=ReviewStatus.PENDING, db_index=True
    )

    admin_response = models.TextField(
        blank=True, help_text="Published alongside an approved review."
    )
    moderated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    moderated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "reviews_review"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rating__gte=MIN_RATING, rating__lte=MAX_RATING),
                name="review_rating_in_range",
            ),
            # A rejection or a hide with no recorded moderator is an anonymous
            # act of censorship. Approval carries the same requirement so the
            # column means one thing in every state.
            models.CheckConstraint(
                condition=~models.Q(status__in=["APPROVED", "HIDDEN", "REJECTED"])
                | models.Q(moderated_at__isnull=False),
                name="moderated_review_has_a_timestamp",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.enrollment_id} rated {self.rating}"

    @property
    def is_moderated(self) -> bool:
        return self.status in MODERATED_STATUSES

    @property
    def is_public(self) -> bool:
        return self.status == ReviewStatus.APPROVED
