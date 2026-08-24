"""
Notifications.

In-app only in the MVP, but SMS is planned for students and professors both
(architecture D-8) - so `channel` and the delivery fields exist from the start.
Adding SMS then becomes a new channel class rather than an ALTER on a table
full of history.

`target_type` and `target_id` are plain columns, like the audit log. A
notification about a payment must outlive the archival of that payment, and
must never be removed by a cascade.
"""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class NotificationKind(models.TextChoices):
    # Professor - the four events, and no others (architecture SS5)
    COURSE_ASSIGNED = "COURSE_ASSIGNED", "Assigned to a course"
    SESSION_REMINDER = "SESSION_REMINDER", "Next session reminder"
    ROSTER_CHANGED = "ROSTER_CHANGED", "Class list changed"
    SCHEDULE_CHANGED = "SCHEDULE_CHANGED", "Schedule changed"

    # Student
    ENROLLED = "ENROLLED", "Enrolled in a course"
    MARKS_PUBLISHED = "MARKS_PUBLISHED", "Marks published"
    PAYMENT_APPROVED = "PAYMENT_APPROVED", "Payment approved"
    PAYMENT_REJECTED = "PAYMENT_REJECTED", "Payment rejected"

    # Staff
    PROOF_REVIEW_NEEDED = "PROOF_REVIEW_NEEDED", "Payment awaiting review"


class Channel(models.TextChoices):
    IN_APP = "IN_APP", "In-app"
    SMS = "SMS", "SMS"
    EMAIL = "EMAIL", "Email"


class DeliveryStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    DELIVERED = "DELIVERED", "Delivered"
    FAILED = "FAILED", "Failed"


class Notification(TimeStampedModel):
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )

    title = models.CharField(max_length=150)
    message = models.TextField()
    kind = models.CharField(max_length=24, choices=NotificationKind.choices, db_index=True)

    channel = models.CharField(max_length=8, choices=Channel.choices, default=Channel.IN_APP)
    delivery_status = models.CharField(
        max_length=10, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING
    )
    delivered_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.CharField(max_length=300, blank=True)

    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    target_type = models.CharField(max_length=50, blank=True)
    target_id = models.CharField(max_length=50, blank=True)
    link_path = models.CharField(
        max_length=200, blank=True, help_text="Frontend route this notification points at."
    )

    class Meta:
        db_table = "notifications_notification"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
            models.Index(fields=["kind", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.recipient_id}: {self.title}"

    def mark_read(self) -> None:
        if self.is_read:
            return
        from django.utils import timezone

        self.is_read = True
        self.read_at = timezone.now()
        self.save(update_fields=["is_read", "read_at", "updated_at"])
