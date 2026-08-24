"""
The audit log.

Append-only, enforced by a database trigger rather than by convention. A log
that the application can edit is not evidence of anything - and the actions
most worth recording here are exactly the ones someone would want to erase.

No foreign keys at all. Not to the actor, not to the object.

That is the same argument in both directions: an audit row must survive the
archival of what it describes and the closure of whoever did it, and a
referential action is a write. `on_delete=SET_NULL` would issue an UPDATE, and
the append-only trigger below refuses it - so a real FK here would make
deleting a user fail rather than make the log safer. Identity is carried by
denormalised copies that were true at the time of the action, which is what an
audit needs anyway: who they were then, not who the row points at now.
"""

from django.db import models


class AuditAction(models.TextChoices):
    # Identity and access
    USER_CREATED = "USER_CREATED", "User created"
    USER_UPDATED = "USER_UPDATED", "User updated"
    USER_STATUS_CHANGED = "USER_STATUS_CHANGED", "User status changed"
    PASSWORD_RESET = "PASSWORD_RESET", "Password reset"
    PASSWORD_CHANGED = "PASSWORD_CHANGED", "Password changed"
    ROLE_GRANTED = "ROLE_GRANTED", "Role granted"
    ROLE_REVOKED = "ROLE_REVOKED", "Role revoked"
    LOGIN_FAILED = "LOGIN_FAILED", "Login failed"

    # Catalogue
    COURSE_CREATED = "COURSE_CREATED", "Course created"
    COURSE_UPDATED = "COURSE_UPDATED", "Course updated"
    COURSE_STATUS_CHANGED = "COURSE_STATUS_CHANGED", "Course status changed"
    PROFESSOR_ASSIGNED = "PROFESSOR_ASSIGNED", "Professor assigned"
    PROFESSOR_UNASSIGNED = "PROFESSOR_UNASSIGNED", "Professor unassigned"
    SCHEDULE_CHANGED = "SCHEDULE_CHANGED", "Schedule changed"

    # Enrolment
    ENROLLMENT_CREATED = "ENROLLMENT_CREATED", "Student enrolled"
    ENROLLMENT_STATUS_CHANGED = "ENROLLMENT_STATUS_CHANGED", "Enrolment status changed"

    # Grades
    MARK_ENTERED = "MARK_ENTERED", "Mark entered"
    MARK_CHANGED = "MARK_CHANGED", "Mark changed"
    MARKS_PUBLISHED = "MARKS_PUBLISHED", "Marks published"

    # Money
    PAYMENT_CREATED = "PAYMENT_CREATED", "Payment recorded"
    PAYMENT_APPROVED = "PAYMENT_APPROVED", "Payment approved"
    PAYMENT_REJECTED = "PAYMENT_REJECTED", "Payment rejected"
    PAYMENT_CANCELLED = "PAYMENT_CANCELLED", "Payment cancelled"
    PROOF_UPLOADED = "PROOF_UPLOADED", "Payment proof uploaded"
    PROOF_DOWNLOADED = "PROOF_DOWNLOADED", "Payment proof downloaded"


class AuditLog(models.Model):
    # Denormalised, not a foreign key. See the module docstring: a referential
    # action is a write, and this table refuses writes.
    actor_public_id = models.CharField(max_length=20, blank=True, db_index=True)
    actor_name = models.CharField(max_length=200, blank=True)

    action = models.CharField(max_length=32, choices=AuditAction.choices, db_index=True)

    object_type = models.CharField(max_length=50, blank=True)
    object_id = models.CharField(max_length=50, blank=True)
    object_label = models.CharField(
        max_length=200, blank=True, help_text="Human-readable at the time of the action."
    )

    old_values = models.JSONField(default=dict, blank=True)
    new_values = models.JSONField(default=dict, blank=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "audit_log"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["object_type", "object_id"]),
            models.Index(fields=["actor_public_id", "-created_at"]),
            models.Index(fields=["action", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.actor_public_id} {self.action}"

    @property
    def changed_fields(self) -> list[str]:
        return sorted(set(self.old_values) | set(self.new_values))
