"""Professor profile. Teaching-specific fields only."""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.wilayas import Wilaya


class ProfessorProfile(TimeStampedModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="professor_profile"
    )

    specialisation = models.CharField(max_length=150, blank=True)
    qualifications = models.TextField(blank=True)
    bio = models.TextField(blank=True)
    wilaya = models.CharField(max_length=2, choices=Wilaya.choices, blank=True)
    hired_at = models.DateField(null=True, blank=True)

    # Integer minor units plus a currency, like every other amount in the
    # platform. Never a float. Readable only with report.view_financial - the
    # serializer drops it for anyone else.
    hourly_rate_minor = models.BigIntegerField(null=True, blank=True)
    currency = models.CharField(max_length=3, default="DZD")

    class Meta:
        db_table = "professors_profile"
        verbose_name = "professor profile"

    def __str__(self) -> str:
        return f"{self.user.public_id} profile"
