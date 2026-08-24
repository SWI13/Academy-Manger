"""
Reading your own notifications.

There is no scope decision to make and no permission to check beyond being
signed in: a notification belongs to exactly one person, and the queryset is
filtered to the caller unconditionally. There is no parameter, at any version,
that widens it.
"""

from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.rbac.permissions import IsAuthenticatedAndActive

from .models import Notification
from .services import unread_count


class NotificationSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id",
            "title",
            "message",
            "kind",
            "kind_display",
            "is_read",
            "read_at",
            "target_type",
            "target_id",
            "link_path",
            "created_at",
        ]
        read_only_fields = fields


@extend_schema_view(
    list=extend_schema(summary="Your notifications"),
    retrieve=extend_schema(summary="One notification"),
)
class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticatedAndActive]
    # Declared so the schema generator can find the model without a request.
    # get_queryset() below is the real filter; this is never served.
    queryset = Notification.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()

        queryset = Notification.objects.filter(recipient=self.request.user)
        if self.request.query_params.get("unread") == "true":
            queryset = queryset.filter(is_read=False)
        return queryset

    @extend_schema(summary="Unread count", responses={200: None})
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread(self, request):
        return Response({"unread": unread_count(request.user)})

    @extend_schema(
        summary="Mark one as read", request=None, responses={200: NotificationSerializer}
    )
    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        notification = self.get_object()
        notification.mark_read()
        return Response(NotificationSerializer(notification).data)

    @extend_schema(summary="Mark all as read", request=None, responses={200: None})
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        updated = Notification.objects.filter(recipient=request.user, is_read=False).update(
            is_read=True, read_at=timezone.now()
        )
        return Response({"marked_read": updated})
