"""
Reading the audit log.

Read-only at every level: there is no create, update or delete endpoint at any
version, the database refuses writes other than INSERT, and only the owner
holds `audit.view`. An admin cannot read the log that records what they did.

Cursor pagination, not page numbers. The table is append-only and unbounded;
deep OFFSET degrades, and rows arriving mid-pagination make page numbers skip
entries - which in a log is a missing record, not a cosmetic glitch.
"""

from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import serializers, viewsets

from apps.core.pagination import AppendOnlyCursorPagination
from apps.rbac.permissions import RequirePermission

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "created_at",
            "actor_public_id",
            "actor_name",
            "action",
            "action_display",
            "object_type",
            "object_id",
            "object_label",
            "old_values",
            "new_values",
            "ip_address",
        ]
        read_only_fields = fields


@extend_schema_view(
    list=extend_schema(
        summary="Read the audit log",
        parameters=[
            OpenApiParameter("action", str, description="Filter by action."),
            OpenApiParameter("actor", str, description="Actor public ID."),
            OpenApiParameter("object_type", str, description="Payment, User, Course, ..."),
            OpenApiParameter("object_id", str, description="Identifier within that type."),
            OpenApiParameter("from", str, description="On or after (ISO date)."),
            OpenApiParameter("to", str, description="On or before (ISO date)."),
        ],
    )
)
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Not a ScopedModelViewSet: there is no per-user scope to apply. Either you
    hold audit.view - which only the owner does - or you see nothing at all.
    """

    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [RequirePermission]
    pagination_class = AppendOnlyCursorPagination

    required_permissions = {"list": "audit.view", "retrieve": "audit.view"}

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        action = (params.get("action") or "").strip().upper()
        if action:
            queryset = queryset.filter(action=action)

        actor = (params.get("actor") or "").strip()
        if actor:
            queryset = queryset.filter(actor_public_id__iexact=actor)

        object_type = (params.get("object_type") or "").strip()
        if object_type:
            queryset = queryset.filter(object_type__iexact=object_type)

        object_id = (params.get("object_id") or "").strip()
        if object_id:
            queryset = queryset.filter(object_id__iexact=object_id)

        start = (params.get("from") or "").strip()
        if start:
            queryset = queryset.filter(created_at__gte=start)

        end = (params.get("to") or "").strip()
        if end:
            queryset = queryset.filter(created_at__lte=end)

        return queryset
