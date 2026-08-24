"""
Student profile.

Only what is specific to being a student. Name, phone and status live on User,
because every user has them and duplicating them here guarantees they diverge.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel
from apps.core.wilayas import Wilaya


class PriorLevel(models.TextChoices):
    """
    Level on arrival, used for placement and filtering.

    Seed values. If the institute teaches something these bands do not fit,
    this is a list to change, not a design to rework.
    """

    BEGINNER = "BEGINNER", "Beginner"
    ELEMENTARY = "ELEMENTARY", "Elementary"
    INTERMEDIATE = "INTERMEDIATE", "Intermediate"
    UPPER_INTERMEDIATE = "UPPER_INTERMEDIATE", "Upper intermediate"
    ADVANCED = "ADVANCED", "Advanced"


class StudentProfile(TimeStampedModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="student_profile"
    )

    # Date of birth, never age. An age column is wrong within a year of being
    # written; `age` below derives it on read.
    date_of_birth = models.DateField(null=True, blank=True)

    wilaya = models.CharField(
        max_length=2,
        choices=Wilaya.choices,
        blank=True,
        db_index=True,
        help_text="Official two-digit wilaya code.",
    )
    prior_level = models.CharField(
        max_length=20,
        choices=PriorLevel.choices,
        blank=True,
        db_index=True,
        help_text="Level on arrival, for placement.",
    )

    address = models.TextField(blank=True)
    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_contact_phone = models.CharField(max_length=16, blank=True)
    notes = models.TextField(
        blank=True, help_text="Administrative notes. Not visible to the student."
    )

    class Meta:
        db_table = "students_profile"
        verbose_name = "student profile"

    def __str__(self) -> str:
        return f"{self.user.public_id} profile"

    @property
    def age(self) -> int | None:
        """Derived, never stored."""
        if not self.date_of_birth:
            return None
        today = timezone.localdate()
        had_birthday = (today.month, today.day) >= (
            self.date_of_birth.month,
            self.date_of_birth.day,
        )
        return today.year - self.date_of_birth.year - (0 if had_birthday else 1)
