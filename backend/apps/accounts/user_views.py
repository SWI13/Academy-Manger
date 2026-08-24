"""
User management.

The first resource to inherit ScopedModelViewSet, so it is the first place the
two gates are load-bearing rather than demonstrated.
"""

import logging

from django.contrib.auth import get_user_model
from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.response import Response

from apps.audit.models import AuditAction
from apps.audit.services import diff, record
from apps.core.enums import UserStatus
from apps.core.viewsets import ScopedModelViewSet
from apps.rbac.models import Role
from apps.rbac.services import assign_role, revoke_role

from .scoping import can_manage_role, scope_users
from .user_serializers import (
    RoleAssignmentSerializer,
    StatusChangeSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)

logger = logging.getLogger(__name__)
User = get_user_model()


@extend_schema_view(
    list=extend_schema(
        summary="List users",
        parameters=[
            OpenApiParameter("q", str, description="Search User ID, phone, first or last name."),
            OpenApiParameter("role", str, description="Filter by primary role."),
            OpenApiParameter("status", str, description="ACTIVE, INACTIVE or SUSPENDED."),
        ],
    ),
    retrieve=extend_schema(summary="Get one user"),
    create=extend_schema(summary="Create a user"),
    partial_update=extend_schema(summary="Edit a user"),
)
class UserViewSet(ScopedModelViewSet):
    """
    No destroy(). A user is deactivated, never deleted - their enrolments,
    payments and marks have to remain attributable.
    """

    queryset = User.objects.all().select_related("student_profile", "professor_profile")
    lookup_field = "public_id"
    lookup_value_regex = "[A-Za-z]+-[0-9]+"

    required_permissions = {
        "list": "user.view",
        "retrieve": "user.view",
        "create": "user.create",
        "update": "user.update",
        "partial_update": "user.update",
        "set_status": "user.deactivate",
        "roles": "user.assign_role",
        # Mapped, but the handler always refuses. Gate 2 runs before the
        # handler, so leaving it unmapped would answer 403 ("you may not
        # delete users") when the truthful answer is 405 ("nobody deletes
        # users here"). Callers without the permission still get 403.
        "destroy": "user.deactivate",
    }

    # DELETE is allowed as a method because revoking a role uses it. Deleting
    # a *user* is refused explicitly below rather than by omitting the verb,
    # so the caller gets 405 ("this does not exist here") instead of 403
    # ("you may not"), which is the honest answer.
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            "DELETE",
            detail=(
                "Users are deactivated, not deleted - their enrolments, payments "
                "and marks must stay attributable. Use POST .../status/ instead."
            ),
        )

    def perform_create(self, serializer):
        user = serializer.save()
        record(
            AuditAction.USER_CREATED,
            actor=self.request.user,
            obj=user,
            new={"primary_role": user.primary_role, "public_id": user.public_id},
        )

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ("update", "partial_update"):
            return UserUpdateSerializer
        return UserSerializer

    def get_queryset(self):
        queryset = super().get_queryset().prefetch_related("user_roles__role")
        params = self.request.query_params

        search = (params.get("q") or "").strip()
        if search:
            # Indexed on public_id and phone; name search is a trigram match,
            # which is what makes "find the student" work with a typo.
            queryset = queryset.filter(
                Q(public_id__icontains=search)
                | Q(phone__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
            )

        role = (params.get("role") or "").strip().upper()
        if role:
            queryset = queryset.filter(primary_role=role)

        state = (params.get("status") or "").strip().upper()
        if state:
            queryset = queryset.filter(status=state)

        return queryset.order_by("public_id")

    def scope_queryset(self, queryset, user):
        return scope_users(queryset, user)

    def perform_update(self, serializer):
        target = serializer.instance
        actor = self.request.user
        before = {
            field: getattr(target, field) for field in ("first_name", "last_name", "phone", "email")
        }
        # Editing yourself is always allowed; editing someone else is bounded
        # by whether your role may manage theirs.
        if actor.pk != target.pk and not can_manage_role(actor, target.primary_role):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Your role cannot edit this user.")
        serializer.save()
        target.refresh_from_db()
        after = {
            field: getattr(target, field) for field in ("first_name", "last_name", "phone", "email")
        }
        old, new = diff(before, after)
        if old or new:
            record(AuditAction.USER_UPDATED, actor=actor, obj=target, old=old, new=new)
        logger.info("User %s edited by %s", target.public_id, actor.public_id)

    @extend_schema(
        summary="Activate, deactivate or suspend a user",
        request=StatusChangeSerializer,
        responses={200: UserSerializer},
    )
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, public_id=None):
        target = self.get_object()
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]
        previous_status = target.status

        if target.pk == request.user.pk:
            return Response(
                {
                    "error": {
                        "code": "self_deactivation",
                        "message": "You cannot change your own account status.",
                        "details": {},
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not can_manage_role(request.user, target.primary_role):
            return Response(
                {
                    "error": {
                        "code": "permission_denied",
                        "message": "Your role cannot change this user's status.",
                        "details": {},
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if new_status == UserStatus.ACTIVE:
            target.reactivate()
        else:
            target.status = new_status
            target.deactivate(by=request.user)
            if new_status != UserStatus.INACTIVE:
                target.status = new_status
                target.save(update_fields=["status"])

        record(
            AuditAction.USER_STATUS_CHANGED,
            actor=request.user,
            obj=target,
            old={"status": previous_status},
            new={"status": new_status, "reason": serializer.validated_data.get("reason", "")},
        )
        logger.info(
            "Status of %s set to %s by %s (%s)",
            target.public_id,
            new_status,
            request.user.public_id,
            serializer.validated_data.get("reason", ""),
        )
        return Response(UserSerializer(target, context=self.get_serializer_context()).data)

    @extend_schema(
        summary="Grant or revoke a role",
        request=RoleAssignmentSerializer,
        responses={200: UserSerializer},
    )
    @action(detail=True, methods=["post", "delete"], url_path="roles")
    def roles(self, request, public_id=None):
        target = self.get_object()
        serializer = RoleAssignmentSerializer(
            data=request.data, context={"request": request, "target": target}
        )
        serializer.is_valid(raise_exception=True)
        role = Role.objects.get(code=serializer.validated_data["role"])

        if request.method == "DELETE":
            revoke_role(target, role, revoked_by=request.user)
        else:
            assign_role(target, role, assigned_by=request.user)

        # get_object() populated a prefetch cache before the role changed.
        # Serializing without clearing it returns the roles as they were a
        # moment ago, which reads as "the grant silently failed".
        target.refresh_from_db()
        target._prefetched_objects_cache = {}

        return Response(UserSerializer(target, context=self.get_serializer_context()).data)
