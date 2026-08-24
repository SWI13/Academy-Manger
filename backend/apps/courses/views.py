"""Course catalogue and professor assignment."""

import logging

from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.response import Response

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.core.viewsets import ScopedModelViewSet
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify

from .models import AssignmentStatus, Course, CourseProfessor, CourseStatus
from .scoping import scope_courses
from .serializers import (
    AssignProfessorSerializer,
    CourseProfessorSerializer,
    CourseSerializer,
    CourseStatusSerializer,
    CourseWriteSerializer,
)

logger = logging.getLogger(__name__)


@extend_schema_view(
    list=extend_schema(
        summary="List courses",
        parameters=[
            OpenApiParameter("q", str, description="Search course ID or title."),
            OpenApiParameter("status", str, description="Filter by status."),
            OpenApiParameter("professor", str, description="Professor public ID."),
        ],
    )
)
class CourseViewSet(ScopedModelViewSet):
    queryset = Course.objects.all().prefetch_related("assignments__professor")
    lookup_field = "public_id"
    lookup_value_regex = "C-[0-9]{4}-[0-9]+"

    required_permissions = {
        "list": "course.view",
        "retrieve": "course.view",
        "create": "course.create",
        "update": "course.update",
        "partial_update": "course.update",
        "set_status": "course.archive",
        "professors": "course.assign_professor",
        "destroy": "course.archive",
    }

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return CourseWriteSerializer
        return CourseSerializer

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            "DELETE",
            detail=(
                "Courses are archived, not deleted - enrolments, marks and payments "
                "reference them. Use POST .../status/ with ARCHIVED."
            ),
        )

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        search = (params.get("q") or "").strip()
        if search:
            queryset = queryset.filter(Q(public_id__icontains=search) | Q(title__icontains=search))

        state = (params.get("status") or "").strip().upper()
        if state:
            queryset = queryset.filter(status=state)

        professor = (params.get("professor") or "").strip()
        if professor:
            queryset = queryset.filter(
                assignments__professor__public_id__iexact=professor,
                assignments__status=AssignmentStatus.ACTIVE,
            )

        return queryset.distinct()

    def scope_queryset(self, queryset, user):
        return scope_courses(queryset, user)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
        record(
            AuditAction.COURSE_CREATED,
            actor=self.request.user,
            obj=serializer.instance,
            new={
                "title": serializer.instance.title,
                "price_minor": serializer.instance.price_minor,
            },
        )
        logger.info(
            "Course %s created by %s",
            serializer.instance.public_id,
            self.request.user.public_id,
        )

    @extend_schema(
        summary="Change course status",
        request=CourseStatusSerializer,
        responses={200: CourseSerializer},
    )
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, public_id=None):
        course = self.get_object()
        serializer = CourseStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]

        previous_status = course.status
        course.status = new_status
        course.archived_at = timezone.now() if new_status == CourseStatus.ARCHIVED else None
        course.save(update_fields=["status", "archived_at", "updated_at"])

        record(
            AuditAction.COURSE_STATUS_CHANGED,
            actor=request.user,
            obj=course,
            old={"status": previous_status},
            new={"status": new_status},
        )
        logger.info(
            "Course %s set to %s by %s", course.public_id, new_status, request.user.public_id
        )
        return Response(CourseSerializer(course, context=self.get_serializer_context()).data)

    @extend_schema(
        summary="Assign or unassign a professor",
        request=AssignProfessorSerializer,
        responses={200: CourseProfessorSerializer},
    )
    @action(detail=True, methods=["get", "post", "delete"], url_path="professors")
    def professors(self, request, public_id=None):
        course = self.get_object()

        if request.method == "GET":
            assignments = course.assignments.filter(status=AssignmentStatus.ACTIVE)
            return Response(CourseProfessorSerializer(assignments, many=True).data)

        serializer = AssignProfessorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        professor = serializer.professor

        if request.method == "DELETE":
            updated = CourseProfessor.objects.filter(
                course=course, professor=professor, status=AssignmentStatus.ACTIVE
            ).update(status=AssignmentStatus.ENDED, ended_at=timezone.now())
            if not updated:
                return Response(
                    {
                        "error": {
                            "code": "not_assigned",
                            "message": "That professor is not assigned to this course.",
                            "details": {},
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            record(
                AuditAction.PROFESSOR_UNASSIGNED,
                actor=request.user,
                obj=course,
                old={"professor": professor.public_id},
            )
            logger.info(
                "Professor %s unassigned from %s by %s",
                professor.public_id,
                course.public_id,
                request.user.public_id,
            )
            return Response(status=status.HTTP_204_NO_CONTENT)

        assignment, created = CourseProfessor.objects.get_or_create(
            course=course,
            professor=professor,
            status=AssignmentStatus.ACTIVE,
            defaults={
                "assignment_role": serializer.validated_data["assignment_role"],
                "assigned_by": request.user,
            },
        )
        if created:
            notify(
                professor,
                NotificationKind.COURSE_ASSIGNED,
                f"You have been assigned to {course.title}",
                f"{course.title} ({course.public_id}) runs from "
                f"{course.start_date:%d/%m/%Y} to {course.end_date:%d/%m/%Y}.",
                target=course,
                link_path="/dashboard",
            )
            record(
                AuditAction.PROFESSOR_ASSIGNED,
                actor=request.user,
                obj=course,
                new={"professor": professor.public_id},
            )
            logger.info(
                "Professor %s assigned to %s by %s",
                professor.public_id,
                course.public_id,
                request.user.public_id,
            )
        return Response(
            CourseProfessorSerializer(assignment).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
