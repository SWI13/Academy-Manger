"""Assessments, the mark sheet, and averages."""

import logging

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.viewsets import ScopedModelViewSet
from apps.courses.models import Course
from apps.courses.scoping import scope_courses, scope_enrollments
from apps.enrollments.models import Enrollment, EnrollmentStatus
from apps.rbac.permissions import RequirePermission
from apps.rbac.services import has_permission

from .models import Assessment, AssessmentScore
from .scoping import can_mark_course, scope_assessments, scope_scores
from .serializers import (
    AssessmentSerializer,
    AssessmentWriteSerializer,
    AverageSerializer,
    GradebookSerializer,
    MarkSheetSerializer,
    ScoreSerializer,
)
from .services import enrollment_average, save_mark_sheet

logger = logging.getLogger(__name__)


@extend_schema_view(
    list=extend_schema(
        summary="List assessments",
        parameters=[
            OpenApiParameter("course", str, description="Course public ID."),
            OpenApiParameter("kind", str, description="QUIZ, MIDTERM, FINAL, ORAL, HOMEWORK."),
        ],
    )
)
class AssessmentViewSet(ScopedModelViewSet):
    queryset = Assessment.objects.all().select_related("course")

    required_permissions = {
        "list": "assessment.view",
        "retrieve": "assessment.view",
        "create": "assessment.manage",
        "update": "assessment.manage",
        "partial_update": "assessment.manage",
        "destroy": "assessment.manage",
        "scores": "score.view",
        "publish": "score.publish",
        "my_marks": "score.view",
    }

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return AssessmentWriteSerializer
        return AssessmentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        course = (params.get("course") or "").strip()
        if course:
            queryset = queryset.filter(course__public_id__iexact=course)

        kind = (params.get("kind") or "").strip().upper()
        if kind:
            queryset = queryset.filter(kind=kind)

        return queryset

    def scope_queryset(self, queryset, user):
        return scope_assessments(queryset, user)

    def perform_update(self, serializer):
        if not can_mark_course(self.request.user, serializer.instance.course):
            raise PermissionDenied("You are not assigned to that course.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.scores.exists():
            # Deleting an assessment would take its marks with it. Marks are
            # the record; they are not collateral.
            raise PermissionDenied(
                "This assessment already has marks. Marks are a record and cannot "
                "be removed by deleting what they belong to."
            )
        instance.delete()

    @extend_schema(
        summary="Read or replace the mark sheet",
        request=MarkSheetSerializer,
        responses={200: ScoreSerializer(many=True)},
        description=(
            "GET returns the class list with marks where they exist. PUT replaces "
            "the whole sheet in one transaction - forty marks either all save or "
            "none do, so a dropped connection cannot leave half a sheet written."
        ),
    )
    @action(detail=True, methods=["get", "put"], url_path="scores")
    def scores(self, request, pk=None):
        assessment = self.get_object()

        if request.method == "GET":
            existing = scope_scores(
                AssessmentScore.objects.filter(assessment=assessment).select_related(
                    "assessment", "enrollment__student", "last_changed_by"
                ),
                request.user,
            )
            return Response(ScoreSerializer(existing, many=True).data)

        # --- PUT: writing the sheet ---
        if not can_mark_course(request.user, assessment.course):
            raise PermissionDenied("You are not assigned to that course.")

        serializer = MarkSheetSerializer(
            data=request.data, context={"request": request, "assessment": assessment}
        )
        serializer.is_valid(raise_exception=True)

        result = save_mark_sheet(assessment, serializer.validated_data["rows"], actor=request.user)

        written = AssessmentScore.objects.filter(assessment=assessment).select_related(
            "assessment", "enrollment__student", "last_changed_by"
        )
        return Response({**result, "scores": ScoreSerializer(written, many=True).data})

    @extend_schema(
        summary="Publish marks to students",
        request=None,
        responses={200: AssessmentSerializer},
        description="Until an assessment is published, its marks are not visible to students.",
    )
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        assessment = self.get_object()
        if not can_mark_course(request.user, assessment.course):
            raise PermissionDenied("You are not assigned to that course.")

        assessment.is_published = True
        assessment.published_at = timezone.now()
        assessment.published_by = request.user
        assessment.save(
            update_fields=["is_published", "published_at", "published_by", "updated_at"]
        )

        logger.info("Assessment %s published by %s", assessment.pk, request.user.public_id)
        return Response(
            AssessmentSerializer(assessment, context=self.get_serializer_context()).data
        )

    @extend_schema(
        summary="The caller's own marks across every course",
        responses={200: ScoreSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="my-marks")
    def my_marks(self, request):
        scores = scope_scores(
            AssessmentScore.objects.select_related(
                "assessment", "assessment__course", "enrollment__student", "last_changed_by"
            ),
            request.user,
        )
        return Response(ScoreSerializer(scores, many=True).data)


@extend_schema(
    summary="Average for one enrolment",
    responses={200: AverageSerializer},
    description=(
        "Computed on read from raw marks, never stored. A stored average cannot "
        "be re-derived after the grading scheme changes, and marks never lock."
    ),
)
class EnrollmentAverageView(APIView):
    """
    A report, not a collection - so a plain view rather than a router entry.
    Registering it as a viewset generated a phantom list route and an
    operationId collision in the schema.
    """

    permission_classes = [RequirePermission]
    required_permission = "score.view"

    def get(self, request, pk):
        enrollment = get_object_or_404(
            scope_enrollments(Enrollment.objects.select_related("course", "student"), request.user),
            pk=pk,
        )
        # A student sees the average of what they are allowed to see. Counting
        # unpublished marks would leak them through the arithmetic.
        published_only = not (
            has_permission(request.user, "score.enter")
            or has_permission(request.user, "course.create")
        )
        data = enrollment_average(enrollment, published_only=published_only)
        return Response(AverageSerializer(data).data)


@extend_schema(
    summary="Class roster with marks",
    parameters=[OpenApiParameter("course", str, description="Course public ID.", required=True)],
    responses={200: GradebookSerializer},
    description="Every live enrolment in a course with each student's average.",
)
class CourseGradebookView(APIView):
    """The screen a professor opens at the end of a term."""

    permission_classes = [RequirePermission]
    required_permission = "score.view"

    def get(self, request):
        course_id = (request.query_params.get("course") or "").strip()
        if not course_id:
            return Response(
                {
                    "error": {
                        "code": "missing_course",
                        "message": "Pass ?course= with a course ID.",
                        "details": {},
                    }
                },
                status=400,
            )

        course = (
            scope_courses(Course.objects.all(), request.user)
            .filter(public_id__iexact=course_id)
            .first()
        )
        if course is None:
            # Out of scope is indistinguishable from absent.
            return Response(
                {"error": {"code": "not_found", "message": "No such course.", "details": {}}},
                status=404,
            )

        enrollments = (
            Enrollment.objects.filter(course=course)
            .exclude(status__in=[EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED])
            .select_related("student", "student__student_profile")
            .order_by("student__last_name", "student__first_name")
        )

        rows = []
        for enrollment in enrollments:
            profile = getattr(enrollment.student, "student_profile", None)
            average = enrollment_average(enrollment)
            rows.append(
                {
                    "enrollment_id": enrollment.pk,
                    "student_public_id": enrollment.student.public_id,
                    "student_name": enrollment.student.get_full_name(),
                    "age": profile.age if profile else None,
                    "wilaya": profile.get_wilaya_display() if profile and profile.wilaya else "",
                    "prior_level": profile.prior_level if profile else "",
                    "weighted_percentage": average["weighted_percentage"],
                    "marked_count": average["marked_count"],
                    "assessment_count": average["assessment_count"],
                }
            )

        return Response(
            {"course_public_id": course.public_id, "course_title": course.title, "students": rows}
        )
