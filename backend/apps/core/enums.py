"""
Shared enumerations.

These live in `core` because more than one app needs them and none of them
should own them. Role *codes* are here; Role *rows*, with their editable
permission sets, arrive with the rbac app in Phase 5.
"""

from django.db import models


class RoleCode(models.TextChoices):
    OWNER = "OWNER", "Owner"
    ADMIN = "ADMIN", "Administrator"
    RECEPTION = "RECEPTION", "Reception"
    PROFESSOR = "PROFESSOR", "Professor"
    STUDENT = "STUDENT", "Student"


class UserStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"
    SUSPENDED = "SUSPENDED", "Suspended"
