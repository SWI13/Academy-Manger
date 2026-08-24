"""
Roles and permissions as data.

Deliberately not Django's contrib.auth Group and Permission. Those tie every
permission row to a ContentType, which forces each one to be about exactly one
model - and `report.view_financial` and `settings.manage` are not about a
model. A thin pair of tables costs little and expresses the domain honestly.

The owner changes any of this through rows, never a deploy.
"""

from django.conf import settings
from django.db import models

from apps.core.enums import RoleCode
from apps.core.models import TimeStampedModel


class Permission(models.Model):
    """One capability the platform recognises. Seeded, never user-created."""

    codename = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=128)
    category = models.CharField(max_length=32, db_index=True)

    class Meta:
        db_table = "rbac_permission"
        ordering = ["category", "codename"]

    def __str__(self) -> str:
        return self.codename


class Role(TimeStampedModel):
    code = models.CharField(max_length=16, unique=True, choices=RoleCode.choices)
    name = models.CharField(max_length=64)
    description = models.TextField(blank=True)
    # System roles are the five the platform is built around. They can have
    # their permissions changed but must not be deleted, or users are orphaned
    # from any authorization at all.
    is_system = models.BooleanField(default=True)

    permissions = models.ManyToManyField(
        Permission, through="RolePermission", related_name="roles"
    )

    class Meta:
        db_table = "rbac_role"
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class RolePermission(models.Model):
    """The editable surface. Granting a power is an INSERT, not a release."""

    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(
        Permission, on_delete=models.CASCADE, related_name="role_permissions"
    )
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    granted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "rbac_role_permission"
        constraints = [
            models.UniqueConstraint(fields=["role", "permission"], name="uniq_role_permission")
        ]

    def __str__(self) -> str:
        return f"{self.role_id}:{self.permission_id}"


class UserRole(models.Model):
    """
    A user's roles. Many-to-many because a small institute really does have a
    receptionist who also teaches - see the architecture, D-1.

    Revocation is a timestamp, never a delete: who held what, and when, is
    exactly the history an audit needs.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="user_roles"
    )
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="user_roles")
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "rbac_user_role"
        constraints = [
            # Partial unique: a user may hold a role once at a time, but the
            # same role can be granted again after being revoked.
            models.UniqueConstraint(
                fields=["user", "role"],
                condition=models.Q(revoked_at__isnull=True),
                name="uniq_active_user_role",
            )
        ]
        indexes = [models.Index(fields=["user", "revoked_at"])]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.role_id}"

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None
