"""Report and export serializers."""

from rest_framework import serializers

from .models import ReportExport


class ReportResultSerializer(serializers.Serializer):
    """
    The shape every report answers in.

    `rows` is deliberately untyped here: the three reports have different
    columns, and inventing a union type would make the schema less honest
    rather than more. Each report's columns are documented on its endpoint.
    """

    report = serializers.CharField()
    filters = serializers.DictField()
    rows = serializers.ListField(child=serializers.DictField())
    totals = serializers.DictField()


class ReportExportSerializer(serializers.ModelSerializer):
    requested_by_public_id = serializers.CharField(source="requested_by.public_id", read_only=True)
    is_ready = serializers.BooleanField(read_only=True)

    class Meta:
        model = ReportExport
        # storage_key is absent on purpose, exactly as it is for payment
        # proofs. The only route to the bytes is a signed URL this API issues.
        fields = [
            "public_id",
            "report_name",
            "fmt",
            "filters",
            "status",
            "row_count",
            "size_bytes",
            "error",
            "requested_by_public_id",
            "created_at",
            "started_at",
            "finished_at",
            "is_ready",
        ]
        read_only_fields = fields


class ExportRequestSerializer(serializers.Serializer):
    """
    Filters for the export, passed through to the same query the JSON
    endpoint runs. Free-form because each report takes different ones; the
    query module ignores what it does not recognise.
    """

    filters = serializers.DictField(required=False, default=dict)


# ---------------------------------------------------------------------------
# The two printable whole-institute documents
#
# Declared shapes rather than bare dicts, for the reason the audit serializer
# gives: an endpoint typed as `unknown` in the generated TypeScript is an
# endpoint the frontend reads with no compiler check, which is the guarantee
# the generated types exist to provide.
# ---------------------------------------------------------------------------
class MoneyTallySerializer(serializers.Serializer):
    key = serializers.CharField(allow_blank=True)
    label = serializers.CharField(allow_blank=True)
    total_minor = serializers.IntegerField()
    count = serializers.IntegerField()


class MonthlyMoneySerializer(serializers.Serializer):
    year = serializers.IntegerField()
    month = serializers.IntegerField()
    income_minor = serializers.IntegerField()
    expense_minor = serializers.IntegerField()
    net_minor = serializers.IntegerField()


class FinancialSummarySerializer(serializers.Serializer):
    from_date = serializers.DateField(allow_null=True)
    to_date = serializers.DateField(allow_null=True)
    currency = serializers.CharField()
    income_total_minor = serializers.IntegerField()
    income_count = serializers.IntegerField()
    pending_total_minor = serializers.IntegerField()
    pending_count = serializers.IntegerField()
    expense_total_minor = serializers.IntegerField()
    expense_count = serializers.IntegerField()
    net_minor = serializers.IntegerField()
    income_by_category = MoneyTallySerializer(many=True)
    expenses_by_category = MoneyTallySerializer(many=True)
    monthly = MonthlyMoneySerializer(many=True)


class ManagementReportSerializer(serializers.Serializer):
    year = serializers.IntegerField()
    month = serializers.IntegerField()
    from_date = serializers.DateField()
    to_date = serializers.DateField()
    currency = serializers.CharField()

    students_total = serializers.IntegerField()
    students_active = serializers.IntegerField()
    new_students = serializers.IntegerField()
    new_enrolments = serializers.IntegerField()
    courses_active = serializers.IntegerField()
    enrolments_live = serializers.IntegerField()

    registers_taken = serializers.IntegerField()
    attendance_present = serializers.IntegerField()
    attendance_late = serializers.IntegerField()
    attendance_absent = serializers.IntegerField()
    attendance_rate = serializers.FloatField(allow_null=True)

    income_total_minor = serializers.IntegerField()
    pending_total_minor = serializers.IntegerField()
    expense_total_minor = serializers.IntegerField()
    net_minor = serializers.IntegerField()
    outstanding_minor = serializers.IntegerField()
    income_by_category = MoneyTallySerializer(many=True)
    expenses_by_category = MoneyTallySerializer(many=True)

    inventory_lines = serializers.IntegerField()
    inventory_units = serializers.IntegerField()
    inventory_needs_repair = serializers.IntegerField()
    inventory_damaged = serializers.IntegerField()
    inventory_missing = serializers.IntegerField()
