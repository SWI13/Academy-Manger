"""
Moderation, and the rule about when a course may be reviewed.

Kept out of the viewset for the same reason every other service layer here is:
the audit entry and the state change belong in one transaction, and a
management command or a task must go through the same door as an HTTP
request.
"""

from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.enrollments.models import EnrollmentStatus

from .models import MODERATED_STATUSES, Review, ReviewStatus


class ReviewError(Exception):
    """The review cannot move the way the caller asked."""


def check_reviewable(enrollment) -> None:
    """
    Raise unless this enrolment may be reviewed.

    Completed only. A review written in week two is a review of an enrolment
    process, and an institute that reads it as a review of the teaching will
    draw the wrong conclusion. This is the rule the phase plan states - "a
    student reviews a completed course".
    """
    if enrollment.status != EnrollmentStatus.COMPLETED:
        raise ReviewError(
            "You can review a course once it is complete. "
            f"This enrolment is {enrollment.get_status_display().lower()}."
        )

    if Review.objects.filter(enrollment=enrollment).exists():
        raise ReviewError("You have already reviewed this course.")


def moderate(review: Review, *, actor, status: str, admin_response: str = "") -> Review:
    """Approve, hide or reject a review, recording who decided."""
    if status == ReviewStatus.PENDING:
        raise ReviewError("A review cannot be moved back to awaiting moderation.")

    if status not in MODERATED_STATUSES:
        raise ReviewError(f"{status} is not a moderation outcome.")

    before = {"status": review.status, "admin_response": review.admin_response}

    with transaction.atomic():
        review.status = status
        if admin_response:
            review.admin_response = admin_response
        review.moderated_by = actor
        review.moderated_at = timezone.now()
        review.save(
            update_fields=[
                "status",
                "admin_response",
                "moderated_by",
                "moderated_at",
                "updated_at",
            ]
        )
        record(
            AuditAction.REVIEW_MODERATED,
            actor=actor,
            obj=review,
            old=before,
            new={"status": review.status, "admin_response": review.admin_response},
            label=f"Review of {review.enrollment.course.public_id}",
        )

    return review
