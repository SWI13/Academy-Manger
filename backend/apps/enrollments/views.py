"""Enrollments, and the class roster built on top of them."""

import logging

from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.response import Response

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.core.viewsets import ScopedModelViewSet
from apps.courses.scoping import scope_enrollments
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify

from .models import Enrollment
from .serializers import (
    EnrollmentCreateSerializer,
    EnrollmentSerializer,
    EnrollmentStatusSerializer,
)

logger = logging.getLogger(__name__)


@extend_schema_view(
    list=extend_schema(
        summary="List enrolments",
        parameters=[
            OpenApiParameter("course", str, description="Course public ID."),
            OpenApiParameter("student", str, description="Student public ID."),
            OpenApiParameter("status", str, description="Filter by status."),
        ],
    )
)
class EnrollmentViewSet(ScopedModelViewSet):
    queryset = Enrollment.objects.all().select_related(
        "course", "student", "student__student_profile"
    )

    required_permissions = {
        "list": "enrollment.view",
        "retrieve": "enrollment.view",
        "create": "enrollment.create",
        "update": "enrollment.update",
        "partial_update": "enrollment.update",
        "set_status": "enrollment.update",
        "destroy": "enrollment.cancel",
    }

    def get_serializer_class(self):
        if self.action == "create":
            return EnrollmentCreateSerializer
        return EnrollmentSerializer

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            "DELETE",
            detail=(
                "Enrolments are cancelled, not deleted - payments and marks reference "
                "them. Use POST .../status/ with CANCELLED."
            ),
        )

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        course = (params.get("course") or "").strip()
        if course:
            queryset = queryset.filter(course__public_id__iexact=course)

        student = (params.get("student") or "").strip()
        if student:
            queryset = queryset.filter(student__public_id__iexact=student)

        state = (params.get("status") or "").strip().upper()
        if state:
            queryset = queryset.filter(status=state)

        return queryset

    def scope_queryset(self, queryset, user):
        return scope_enrollments(queryset, user)

    def perform_create(self, serializer):
        enrollment = serializer.save()
        notify(
            enrollment.student,
            NotificationKind.ENROLLED,
            f"You are enrolled in {enrollment.course.title}",
            f"{enrollment.course.title} ({enrollment.course.public_id}) starts "
            f"{enrollment.course.start_date:%d/%m/%Y}.",
            target=enrollment.course,
            link_path="/courses",
        )
        record(
            AuditAction.ENROLLMENT_CREATED,
            actor=self.request.user,
            obj=enrollment,
            new={
                "student": enrollment.student.public_id,
                "course": enrollment.course.public_id,
                "price_minor": enrollment.price_at_enrollment_minor,
            },
        )
        logger.info(
            "Enrolled %s in %s by %s",
            enrollment.student.public_id,
            enrollment.course.public_id,
            self.request.user.public_id,
        )

    @extend_schema(
        summary="Change enrolment status",
        request=EnrollmentStatusSerializer,
        responses={200: EnrollmentSerializer},
    )
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        enrollment = self.get_object()
        serializer = EnrollmentStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        previous_status = enrollment.status
        enrollment.status = serializer.validated_data["status"]
        enrollment.save(update_fields=["status", "updated_at"])

        record(
            AuditAction.ENROLLMENT_STATUS_CHANGED,
            actor=request.user,
            obj=enrollment,
            old={"status": previous_status},
            new={"status": enrollment.status},
        )

        logger.info(
            "Enrolment %s set to %s by %s (%s)",
            enrollment.pk,
            enrollment.status,
            request.user.public_id,
            serializer.validated_data.get("reason", ""),
        )
        return Response(
            EnrollmentSerializer(enrollment, context=self.get_serializer_context()).data
        )
