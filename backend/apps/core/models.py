"""
Abstract bases every domain model inherits, plus the identifier counter table.

The soft-delete pattern here is deliberate about which manager is the default.
`objects` hides deleted rows, so ordinary code cannot accidentally resurrect
them; `all_objects` includes them and is named awkwardly on purpose, so that
reaching for it is a visible decision in code review.
"""

from django.conf import settings
from django.db import IntegrityError, models
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


class Organisation(TimeStampedModel):
    """
    Who this institute is, on paper.

    One row, ever. Every printed document opens with the name, the address and
    the contact line, and section 12 of the requirement is explicit that those
    come from the institute's own profile rather than from a constant in a
    component - so they are a row an owner edits, not a deploy.

    This is what `settings.manage` has been reserved for since Phase 5: the
    permission was seeded to the owner alone and, until now, governed nothing.

    ---------------------------------------------------------------------
    Why a singleton table rather than environment variables
    ---------------------------------------------------------------------
    A phone number on a receipt is not deployment configuration. The owner
    changes it themselves, on a Tuesday, without anybody rebuilding an image -
    which is the same argument that made roles and permissions rows in the
    first place.

    The logo is deliberately *not* here. The official artwork already lives in
    the frontend at `public/brand/`, placed by `ui/Logo` under a rule that it
    is never redrawn; a second copy uploaded through a form is how an
    institute ends up with two logos and no answer about which is current.
    """

    # Singleton by primary key. `load()` is the only supported way in.
    SINGLETON_PK = 1

    name = models.CharField(max_length=120, default="SM Academy")
    # The formal name for the bottom of a receipt, when it differs from the
    # one on the sign outside.
    legal_name = models.CharField(max_length=200, blank=True)

    address_line = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=80, blank=True)
    wilaya = models.CharField(max_length=80, blank=True)

    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    website = models.CharField(max_length=120, blank=True)

    # Free text under the contact line: a registration number, a tax
    # identifier, whatever this institute is required to print.
    registration_number = models.CharField(max_length=80, blank=True)
    tagline = models.CharField(max_length=160, blank=True)

    # What a printed document says at the very bottom of every page.
    print_footer = models.CharField(
        max_length=200,
        blank=True,
        help_text="Printed at the foot of every page, beside the page number.",
    )

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        db_table = "core_organisation"
        verbose_name = "organisation"

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        # Enforced here rather than trusted. A second row would mean two
        # answers to "what is this institute called" and no rule about which
        # one a report picks up.
        self.pk = self.SINGLETON_PK
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise IntegrityError("The organisation profile cannot be deleted. Edit it instead.")

    @classmethod
    def load(cls) -> "Organisation":
        """The profile, creating it with defaults the first time it is asked for."""
        organisation, _ = cls.objects.get_or_create(pk=cls.SINGLETON_PK)
        return organisation

    @property
    def address(self) -> str:
        """The address on one line, for a document header."""
        return ", ".join(part for part in (self.address_line, self.city, self.wilaya) if part)

    @property
    def contact_line(self) -> str:
        """Phone, email and website, joined with the separator a header uses."""
        return " · ".join(part for part in (self.phone, self.email, self.website) if part)
