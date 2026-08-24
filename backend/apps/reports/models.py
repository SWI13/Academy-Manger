"""
Export jobs.

An export is a row before it is a file. Generating a term's outstanding-balance
CSV inline would hold a request open for as long as the query takes and hand
the browser a timeout instead of a spreadsheet, so the request creates a job,
the worker fills it, and the client asks again.

The row also carries something the file cannot: who asked for it. A CSV of
every family's outstanding balance is one of the most sensitive things this
platform can produce, and "which member of staff pulled that, and when" is a
question worth being able to answer afterwards.

The file itself lands in the same private bucket as payment proofs and is
reached the same way - a short-lived signed URL, never a public path.
"""

import uuid

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class ExportStatus(models.TextChoices):
    PENDING = "PENDING", "Queued"
    RUNNING = "RUNNING", "Running"
    READY = "READY", "Ready"
    FAILED = "FAILED", "Failed"


class ReportExport(TimeStampedModel):
    # A UUID, not a sequential id. Export ids appear in URLs that staff paste
    # to each other, and a guessable one invites a walk through the range.
    public_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)

    report_name = models.CharField(max_length=32, db_index=True)
    fmt = models.CharField(max_length=8, default="csv")
    filters = models.JSONField(default=dict, blank=True)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="report_exports"
    )

    status = models.CharField(
        max_length=8, choices=ExportStatus.choices, default=ExportStatus.PENDING, db_index=True
    )
    storage_key = models.CharField(max_length=500, blank=True)
    row_count = models.IntegerField(null=True, blank=True)
    size_bytes = models.BigIntegerField(null=True, blank=True)
    error = models.CharField(max_length=300, blank=True)

    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "reports_export"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["requested_by", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.report_name} {self.status}"

    @property
    def is_ready(self) -> bool:
        return self.status == ExportStatus.READY and bool(self.storage_key)
