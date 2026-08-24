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
