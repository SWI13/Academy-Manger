"""
A concrete scoped viewset, for testing the base classes.

Not part of the shipped API. It exists so that gate 2 and gate 3 can be tested
as mechanisms now, before any real resource uses them - the first real
consumer should inherit something that is already proven.
"""

from django.contrib.auth import get_user_model
from django.urls import include, path
from rest_framework import serializers
from rest_framework.routers import DefaultRouter

from apps.core.viewsets import ScopedModelViewSet
from apps.rbac.services import has_permission

User = get_user_model()


class ThingSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "public_id", "first_name", "primary_role"]


class ThingViewSet(ScopedModelViewSet):
    """Stands in for any resource. Scope: your own row, unless you may see all."""

    queryset = User.objects.all().order_by("id")
    serializer_class = ThingSerializer
    required_permissions = {
        "list": "user.view",
        "retrieve": "user.view",
        "update": "user.update",
        "partial_update": "user.update",
        "destroy": "user.deactivate",
        # "create" is deliberately unmapped, to prove an unmapped action is denied.
    }

    def scope_queryset(self, queryset, user):
        if has_permission(user, "user.deactivate"):
            return queryset  # owner and admin see everyone
        return queryset.filter(pk=user.pk)


class UnscopedViewSet(ScopedModelViewSet):
    """Forgets scope_queryset. Must raise rather than return everything."""

    queryset = User.objects.all()
    serializer_class = ThingSerializer
    required_permissions = {"list": "user.view"}


class UndeclaredViewSet(ScopedModelViewSet):
    """Declares no permission at all. Must be closed, not open."""

    queryset = User.objects.all()
    serializer_class = ThingSerializer

    def scope_queryset(self, queryset, user):
        return queryset


router = DefaultRouter()
router.register("things", ThingViewSet, basename="thing")
router.register("unscoped", UnscopedViewSet, basename="unscoped")
router.register("undeclared", UndeclaredViewSet, basename="undeclared")

urlpatterns = [
    path("api/v1/", include(router.urls)),
    path("api/v1/auth/", include("apps.accounts.urls")),
]
