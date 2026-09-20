"""
The things the academy owns, and what it spends to keep the doors open.

Two halves, one app, because they answer the same question from two sides:
the inventory is what the money bought, and the expenses are what the money
went on. Splitting them into two apps would put a category table in each.

---------------------------------------------------------------------------
Categories are rows, not code
---------------------------------------------------------------------------
"Chairs", "Projectors", "Electricity", "Cleaning" are data. An owner who buys
the institute's first 3D printer adds a category and carries on; nobody
deploys. That is why `Category` is a table with a `kind` discriminator rather
than two TextChoices - a TextChoices is a deploy, and the whole point of this
module is that the office can describe its own equipment.

What is *not* data is the small closed vocabulary the interface reasons
about: condition and status drive colours, dashboard tiles and filters, so
they stay enumerations the code can be sure of.

---------------------------------------------------------------------------
Money, and deletion
---------------------------------------------------------------------------
Purchase prices and expense amounts are integer minor units plus a currency
code, the same as everywhere else in this codebase. Never a float, and no
arithmetic on money outside the aggregates in `services.py`.

Items and expenses are the platform's first users of `SoftDeleteModel`. The
requirement is a delete button; the platform's rule is that nothing is
destroyed. Both hold: the row leaves every list and every total the moment it
is deleted, and the record of what was owned and what was spent survives
somebody tidying up.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.core.identifiers import next_identifier
from apps.core.models import SoftDeleteModel, TimeStampedModel

# The earliest and latest accounting year an expense may be filed under. Wide
# enough never to be in the way, narrow enough that a mistyped 20226 is
# refused by the database rather than sorted to the end of every list.
MIN_PERIOD_YEAR = 2000
MAX_PERIOD_YEAR = 2100


class CategoryKind(models.TextChoices):
    ITEM = "ITEM", "Inventory item"
    EXPENSE = "EXPENSE", "Expense"


class ItemCondition(models.TextChoices):
    NEW = "NEW", "New"
    GOOD = "GOOD", "Good"
    NEEDS_REPAIR = "NEEDS_REPAIR", "Needs repair"
    DAMAGED = "DAMAGED", "Damaged"


class ItemStatus(models.TextChoices):
    AVAILABLE = "AVAILABLE", "Available"
    IN_USE = "IN_USE", "In use"
    UNDER_REPAIR = "UNDER_REPAIR", "Under repair"
    MISSING = "MISSING", "Missing"


class Category(TimeStampedModel):
    """
    One label an owner or admin can create. Shared by both halves.

    `kind` keeps an expense category out of an item dropdown and the other way
    round. One table rather than two identical ones: the columns, the
    permissions and the endpoints would have been the same in both, and a pair
    of tables that must be changed together is a pair that drifts.

    Never deleted through the API. A category is referenced by every row filed
    under it, so retiring one is `is_active = False` - it leaves the dropdowns
    and the existing rows keep their label.
    """

    kind = models.CharField(max_length=8, choices=CategoryKind.choices, db_index=True)
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "logistics_category"
        ordering = ["kind", "name"]
        verbose_name_plural = "categories"
        constraints = [
            models.UniqueConstraint(fields=["kind", "name"], name="uniq_logistics_category_name")
        ]

    def __str__(self) -> str:
        return self.name


class Location(TimeStampedModel):
    """
    A room, a store, a workshop.

    Deliberately its own table rather than the free-text `room` on a schedule
    slot. The requirement is a printed list per room and a filter by room, and
    both of those quietly fail when half the rows say "Lab 2" and the other
    half say "lab2".
    """

    name = models.CharField(max_length=80, unique=True)
    description = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "logistics_location"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class LogisticsItem(TimeStampedModel, SoftDeleteModel):
    """
    One line of the inventory: forty chairs, or one projector with a serial.

    `quantity` is what lets both be one row. Identical, interchangeable things
    are counted; a machine with a serial number is its own row with a quantity
    of one, because "PC, quantity 12, serial ..." is a serial that belongs to
    eleven other machines as well.
    """

    public_id = models.CharField(max_length=16, unique=True, editable=False)

    name = models.CharField(max_length=120, db_index=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="items")

    quantity = models.PositiveIntegerField(default=1)

    condition = models.CharField(
        max_length=16, choices=ItemCondition.choices, default=ItemCondition.GOOD, db_index=True
    )
    status = models.CharField(
        max_length=16, choices=ItemStatus.choices, default=ItemStatus.AVAILABLE, db_index=True
    )

    location = models.ForeignKey(
        Location, null=True, blank=True, on_delete=models.SET_NULL, related_name="items"
    )

    purchase_date = models.DateField(null=True, blank=True)
    # Optional, and integer minor units when it is given. A price nobody
    # recorded is null, not zero - zero is a thing that was free.
    purchase_price_minor = models.BigIntegerField(null=True, blank=True)
    currency = models.CharField(max_length=3, default="DZD")

    serial_number = models.CharField(max_length=80, blank=True)
    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "logistics_item"
        ordering = ["-updated_at", "name"]
        # `objects` hides soft-deleted rows, which is right for the app and
        # wrong for Django's own related-object lookups. Naming a plain
        # manager here keeps a deleted row reachable from the ORM internals
        # that must see it, without offering it to anything that merely asks.
        base_manager_name = "all_objects"
        indexes = [
            models.Index(fields=["category", "status"]),
            models.Index(fields=["condition", "status"]),
            models.Index(fields=["location", "name"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=0), name="logistics_quantity_not_negative"
            ),
            models.CheckConstraint(
                condition=models.Q(purchase_price_minor__isnull=True)
                | models.Q(purchase_price_minor__gte=0),
                name="logistics_price_not_negative",
            ),
            # A serial number identifies one physical machine. Two live rows
            # claiming the same one means somebody typed it twice, and an
            # inventory that counts a laptop twice is worse than one nobody
            # wrote down. Blank is exempt: most rows have no serial, and forty
            # chairs share the absence of one.
            models.UniqueConstraint(
                fields=["serial_number"],
                condition=models.Q(deleted_at__isnull=True) & ~models.Q(serial_number=""),
                name="uniq_live_logistics_serial_number",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.public_id} {self.name}"

    def save(self, *args, **kwargs):
        if not self.public_id:
            self.public_id = next_identifier("LOG", width=6)
        super().save(*args, **kwargs)

    def clean(self):
        if self.category_id and self.category.kind != CategoryKind.ITEM:
            raise ValidationError({"category": "That is an expense category, not an item one."})

    @property
    def needs_attention(self) -> bool:
        """Worth a tile on the dashboard: broken, being fixed, or gone."""
        return self.condition in (
            ItemCondition.NEEDS_REPAIR,
            ItemCondition.DAMAGED,
        ) or self.status in (ItemStatus.UNDER_REPAIR, ItemStatus.MISSING)


class Expense(TimeStampedModel, SoftDeleteModel):
    """
    One thing the institute paid for.

    ---------------------------------------------------------------------
    Why there is a date and a month, and not just a date
    ---------------------------------------------------------------------
    `spent_on` is when the money left. `period_year` and `period_month` are
    the month the expense belongs to. They default to the month of `spent_on`
    and can be set apart from it, because February's electricity bill paid on
    3 March belongs in February's total - and an office that cannot say so
    will file it in March and then argue with the figure.

    Every total in `services.py` is computed over the period, never over
    `spent_on`. That is what makes "March" mean the same thing on the
    dashboard, in the history table and on the printed report.
    """

    public_id = models.CharField(max_length=16, unique=True, editable=False)

    name = models.CharField(max_length=120, db_index=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="expenses")

    amount_minor = models.BigIntegerField(help_text="Integer minor units. Never a float.")
    currency = models.CharField(max_length=3, default="DZD")

    spent_on = models.DateField(help_text="When the money left, not when it was typed in.")
    period_year = models.PositiveIntegerField(db_index=True)
    period_month = models.PositiveSmallIntegerField(db_index=True)

    # The same vocabulary the ledger uses - the choices are validated against
    # `payments.PaymentMethod` in the serializer rather than redeclared here.
    # Two lists of payment methods is how "BANK_TRANSFER" becomes "TRANSFER"
    # in one report and nowhere else.
    method = models.CharField(max_length=16, blank=True)

    reference = models.CharField(
        max_length=80, blank=True, help_text="Receipt or invoice number, if there is one."
    )
    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "logistics_expense"
        ordering = ["-period_year", "-period_month", "-spent_on", "-created_at"]
        base_manager_name = "all_objects"
        indexes = [
            models.Index(fields=["period_year", "period_month"]),
            models.Index(fields=["category", "period_year", "period_month"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount_minor__gte=0), name="logistics_expense_not_negative"
            ),
            models.CheckConstraint(
                condition=models.Q(period_month__gte=1) & models.Q(period_month__lte=12),
                name="logistics_expense_month_in_range",
            ),
            models.CheckConstraint(
                condition=models.Q(period_year__gte=MIN_PERIOD_YEAR)
                & models.Q(period_year__lte=MAX_PERIOD_YEAR),
                name="logistics_expense_year_in_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.public_id} {self.name}"

    def save(self, *args, **kwargs):
        if not self.public_id:
            self.public_id = next_identifier("EXP", width=6)
        # The period follows the date unless somebody said otherwise. Set here
        # rather than in the serializer so a management command or a shell
        # session cannot create a row with no accounting month.
        if self.spent_on:
            if not self.period_year:
                self.period_year = self.spent_on.year
            if not self.period_month:
                self.period_month = self.spent_on.month
        super().save(*args, **kwargs)

    def clean(self):
        if self.category_id and self.category.kind != CategoryKind.EXPENSE:
            raise ValidationError({"category": "That is an item category, not an expense one."})

    @property
    def period(self) -> str:
        """`2026-03` - the key every month-shaped screen and URL uses."""
        return f"{self.period_year:04d}-{self.period_month:02d}"
