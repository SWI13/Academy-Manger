"""
Logistics serializers.

Read and write shapes are separate classes wherever they differ, the same way
the courses app does it. The write serializers are where the data-integrity
rules live that a check constraint cannot express in a message a person can
read: a negative quantity is refused by the database, but "Quantity cannot be
negative" is refused here, beside the field that caused it.
"""

from rest_framework import serializers

from apps.payments.models import PaymentMethod

from .models import (
    MAX_PERIOD_YEAR,
    MIN_PERIOD_YEAR,
    Category,
    CategoryKind,
    Expense,
    Location,
    LogisticsItem,
)


class LogisticsCategorySerializer(serializers.ModelSerializer):
    # How much is filed under this label. What makes the setup screen
    # answerable: nobody can tell whether retiring a category is safe without
    # knowing what points at it.
    usage_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = [
            "id",
            "kind",
            "name",
            "description",
            "is_active",
            "usage_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "usage_count", "created_at", "updated_at"]

    def validate_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            raise serializers.ValidationError("A category needs a name.")
        return name


class LogisticsLocationSerializer(serializers.ModelSerializer):
    usage_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Location
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "usage_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "usage_count", "created_at", "updated_at"]

    def validate_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            raise serializers.ValidationError("A location needs a name.")
        return name


class LogisticsItemSerializer(serializers.ModelSerializer):
    """
    The read shape.

    The category and location are flattened to a name beside their id rather
    than nested. Every screen that shows an item wants the label, and a nested
    object would mean the table asking for `item.category.name` through two
    optional levels for a value that is never absent.
    """

    category_name = serializers.CharField(source="category.name", read_only=True)
    location_name = serializers.CharField(
        source="location.name", read_only=True, allow_null=True, default=None
    )
    condition_display = serializers.CharField(source="get_condition_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = LogisticsItem
        fields = [
            "id",
            "public_id",
            "name",
            "category",
            "category_name",
            "quantity",
            "condition",
            "condition_display",
            "status",
            "status_display",
            "location",
            "location_name",
            "purchase_date",
            "purchase_price_minor",
            "currency",
            "serial_number",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "public_id", "created_at", "updated_at"]


class LogisticsItemWriteSerializer(LogisticsItemSerializer):
    """
    The write shape, which is the read shape with the rules attached.

    It *extends* the reader rather than listing its own subset of fields, the
    same way `CourseWriteSerializer` does - and for a reason worth stating,
    because the alternative looks tidier and is broken: a create whose
    response body is the write shape does not carry `public_id`, so the caller
    that just made the row cannot say which row it made. The frontend
    navigates to the item it created; with a narrower serializer it would
    navigate to `/logistics/undefined`.
    """

    class Meta(LogisticsItemSerializer.Meta):
        read_only_fields = ["id", "public_id", "created_at", "updated_at"]

    def validate_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            raise serializers.ValidationError("An item needs a name.")
        return name

    def validate_category(self, category: Category) -> Category:
        if category.kind != CategoryKind.ITEM:
            raise serializers.ValidationError("That is an expense category, not an item one.")
        return category

    def validate_quantity(self, value: int) -> int:
        # PositiveIntegerField and a check constraint both refuse a negative
        # number; neither of them says so next to the box.
        if value < 0:
            raise serializers.ValidationError("Quantity cannot be negative.")
        return value

    def validate_purchase_price_minor(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("A purchase price cannot be negative.")
        return value

    def validate_serial_number(self, value: str) -> str:
        serial = value.strip()
        if not serial:
            return ""

        # The partial unique index is the guarantee; this is the message. An
        # IntegrityError surfaces as a 500, and "duplicate key value violates
        # unique constraint" is not a sentence to show a receptionist.
        clash = LogisticsItem.objects.filter(serial_number__iexact=serial)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("Another item already has that serial number.")
        return serial


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    method_display = serializers.SerializerMethodField()
    period = serializers.CharField(read_only=True)

    class Meta:
        model = Expense
        fields = [
            "id",
            "public_id",
            "name",
            "category",
            "category_name",
            "amount_minor",
            "currency",
            "spent_on",
            "period_year",
            "period_month",
            "period",
            "method",
            "method_display",
            "reference",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "public_id", "period", "created_at", "updated_at"]

    def get_method_display(self, expense) -> str:
        return PaymentMethod(expense.method).label if expense.method else ""


class ExpenseWriteSerializer(ExpenseSerializer):
    """The read shape plus the rules. See `LogisticsItemWriteSerializer`."""

    # Optional on the way in: absent means "the month it was spent in", which
    # is right nearly always. Present means somebody deliberately filed
    # February's bill under February after paying it in March.
    period_year = serializers.IntegerField(
        required=False, min_value=MIN_PERIOD_YEAR, max_value=MAX_PERIOD_YEAR
    )
    period_month = serializers.IntegerField(required=False, min_value=1, max_value=12)
    method = serializers.ChoiceField(
        choices=PaymentMethod.choices, required=False, allow_blank=True, default=""
    )

    class Meta(ExpenseSerializer.Meta):
        read_only_fields = ["id", "public_id", "period", "created_at", "updated_at"]

    def validate_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            raise serializers.ValidationError("An expense needs a name.")
        return name

    def validate_category(self, category: Category) -> Category:
        if category.kind != CategoryKind.EXPENSE:
            raise serializers.ValidationError("That is an item category, not an expense one.")
        return category

    def validate_amount_minor(self, value: int) -> int:
        if value < 0:
            raise serializers.ValidationError("An amount cannot be negative.")
        return value

    def validate(self, attrs):
        # Derived here as well as in `Model.save`, and for a reason `save`
        # cannot cover: an edit that moves only `spent_on` must move the
        # accounting month with it, and `save` only fills a period that is
        # empty. An explicit period in the same request still wins.
        spent_on = attrs.get("spent_on")
        if spent_on:
            attrs.setdefault("period_year", spent_on.year)
            attrs.setdefault("period_month", spent_on.month)
        return attrs


# ---------------------------------------------------------------------------
# Report shapes
#
# Plain Serializers rather than dicts returned bare. drf-spectacular can only
# describe what it is told about, and an endpoint typed as `unknown` in the
# generated TypeScript is an endpoint the frontend reads without a compiler
# check - which is precisely the guarantee the generated types exist for.
# ---------------------------------------------------------------------------
class TallySerializer(serializers.Serializer):
    """One row of a breakdown: a label, and the two ways of counting it."""

    key = serializers.CharField()
    label = serializers.CharField()
    items = serializers.IntegerField()
    units = serializers.IntegerField()


class InventoryTotalsSerializer(serializers.Serializer):
    """
    Every figure `services.inventory_overview` produces.

    Split from the overview endpoint's own shape because the printable
    endpoint sends the same totals without the "recently added" list - a
    printed sheet has no use for a five-row activity feed.
    """

    items_total = serializers.IntegerField()
    units_total = serializers.IntegerField()
    needs_repair_items = serializers.IntegerField()
    needs_repair_units = serializers.IntegerField()
    damaged_items = serializers.IntegerField()
    damaged_units = serializers.IntegerField()
    missing_items = serializers.IntegerField()
    missing_units = serializers.IntegerField()
    under_repair_items = serializers.IntegerField()
    under_repair_units = serializers.IntegerField()
    available_items = serializers.IntegerField()
    available_units = serializers.IntegerField()
    in_use_items = serializers.IntegerField()
    in_use_units = serializers.IntegerField()
    categories_total = serializers.IntegerField()
    locations_total = serializers.IntegerField()
    by_category = TallySerializer(many=True)
    by_condition = TallySerializer(many=True)
    by_location = TallySerializer(many=True)


class LogisticsOverviewSerializer(InventoryTotalsSerializer):
    """The totals, plus what was added most recently."""

    recent = LogisticsItemSerializer(many=True)


class ExpenseTallySerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    total_minor = serializers.IntegerField()
    count = serializers.IntegerField()


class ExpenseMonthSerializer(serializers.Serializer):
    year = serializers.IntegerField()
    month = serializers.IntegerField()
    total_minor = serializers.IntegerField()
    count = serializers.IntegerField()


class ExpenseHistoryRowSerializer(ExpenseMonthSerializer):
    top_category = serializers.CharField(allow_blank=True)
    top_category_total_minor = serializers.IntegerField()
    currency = serializers.CharField()


class LogisticsPrintSerializer(serializers.Serializer):
    """What the printable inventory endpoint answers with."""

    results = LogisticsItemSerializer(many=True)
    overview = InventoryTotalsSerializer()
    printed_at = serializers.DateTimeField()


class ExpenseSummarySerializer(serializers.Serializer):
    year = serializers.IntegerField()
    month = serializers.IntegerField()
    currency = serializers.CharField()
    month_total_minor = serializers.IntegerField()
    month_count = serializers.IntegerField()
    previous_year = serializers.IntegerField()
    previous_month = serializers.IntegerField()
    previous_total_minor = serializers.IntegerField()
    change_minor = serializers.IntegerField()
    year_total_minor = serializers.IntegerField()
    by_category = ExpenseTallySerializer(many=True)
    monthly = ExpenseMonthSerializer(many=True)


class ExpensePrintSerializer(serializers.Serializer):
    """What the printable expenses endpoint answers with."""

    results = ExpenseSerializer(many=True)
    summary = ExpenseSummarySerializer()
    printed_at = serializers.DateTimeField()


class ExpenseHistorySerializer(serializers.Serializer):
    results = ExpenseHistoryRowSerializer(many=True)
