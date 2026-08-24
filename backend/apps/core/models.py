"""
Abstract bases every domain model inherits, plus the identifier counter table.

The soft-delete pattern here is deliberate about which manager is the default.
`objects` hides deleted rows, so ordinary code cannot accidentally resurrect
them; `all_objects` includes them and is named awkwardly on purpose, so that
reaching for it is a visible decision in code review.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SoftDeleteQuerySet(models.QuerySet):
    def alive(self):
        return self.filter(deleted_at__isnull=True)

    def dead(self):
        return self.filter(deleted_at__isnull=False)

    def delete(self):
        """Bulk soft delete. Never issues a SQL DELETE."""
        return self.update(deleted_at=timezone.now())

    def hard_delete(self):
        return super().delete()


class AliveManager(models.Manager):
    """Default manager: deleted rows do not exist as far as the app is concerned."""

    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db).alive()


class SoftDeleteModel(models.Model):
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    objects = AliveManager()
    all_objects = SoftDeleteQuerySet.as_manager()

    class Meta:
        abstract = True

    def delete(self, using=None, keep_parents=False, *, deleted_by=None):
        """Soft delete. `hard_delete()` exists but is never called by the app."""
        self.deleted_at = timezone.now()
        self.deleted_by = deleted_by
        self.save(update_fields=["deleted_at", "deleted_by"])

    def hard_delete(self, using=None, keep_parents=False):
        super().delete(using=using, keep_parents=keep_parents)

    def restore(self):
        self.deleted_at = None
        self.deleted_by = None
        self.save(update_fields=["deleted_at", "deleted_by"])

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class IdentifierSequence(models.Model):
    """
    One row per identifier scope: STU, PROF, ADMIN, REC, C-2026, PAY.

    A counter table rather than a native PostgreSQL sequence because course
    identifiers are year-scoped (C-2026-001) and would otherwise need a new
    sequence created every January. Allocation takes a row lock, which is
    uncontended in practice - identifiers are only issued when a user or a
    course is created, not on every request.
    """

    key = models.CharField(max_length=32, primary_key=True)
    current_value = models.BigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "core_identifier_sequence"
        verbose_name = "identifier sequence"

    def __str__(self) -> str:
        return f"{self.key}={self.current_value}"
