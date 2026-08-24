"""Reviews and moderation."""

import logging

from django.db.models import Avg, Count
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status as http_status
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.audit.models import AuditAction
from apps.audit.services import diff, record
from apps.core.viewsets import ScopedModelViewSet
from apps.courses.models import Course
from apps.courses.scoping import scope_courses, scope_enrollments
from apps.enrollments.models import Enrollment

from .models import MAX_RATING, MIN_RATING, Review, ReviewStatus
from .scoping import scope_reviews
from .serializers import (
    CourseRatingSerializer,
    ModerationSerializer,
    ReviewCreateSerializer,
    ReviewSerializer,
    ReviewUpdateSerializer,
)
from .services import ReviewError, check_reviewable, moderate

logger = logging.getLogger(__name__)


def _review_error(message: str):
    return Response(
        {"error": {"code": "review_not_allowed", "message": message, "details": {}}},
        status=http_status.HTTP_409_CONFLICT,
    )


@extend_schema_view(
    list=extend_schema(
        summary="List reviews",
        parameters=[
            OpenApiParameter("course", str, description="Course public ID."),
            OpenApiParameter("status", str, description="PENDING, APPROVED, HIDDEN, REJECTED."),
            OpenApiParameter("rating", int, description="Exact star rating, 1-5."),
        ],
    ),
    retrieve=extend_schema(summary="One review"),
)
class ReviewViewSet(ScopedModelViewSet):
    """
    A student writes one review per completed enrolment; a moderator rules on
    it. There is no DELETE - hiding is the reversible act, deletion is not,
    and a moderation decision nobody can inspect afterwards is not moderation.
    """

    queryset = Review.objects.select_related(
        "enrollment__student", "enrollment__course", "moderated_by"
    )

    # DELETE is routed so the handler below can answer 405 rather than letting
    # the permission layer answer 403 first. "Nobody deletes reviews" is the
    # truthful reply; "you may not" is not.
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    required_permissions = {
        "list": "review.view",
        "retrieve": "review.view",
        "create": "review.create",
        "partial_update": "review.create",
        "moderate": "review.moderate",
        "summary": "review.view",
        # Mapped only so destroy() is reached and can answer 405.
        "destroy": "review.view",
    }

    def get_serializer_class(self):
        if self.action == "create":
            return ReviewCreateSerializer
        if self.action == "partial_update":
            return ReviewUpdateSerializer
        return ReviewSerializer

    def scope_queryset(self, queryset, user):
        return scope_reviews(queryset, user)

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        course = (params.get("course") or "").strip()
        if course:
            queryset = queryset.filter(enrollment__course__public_id__iexact=course)

        state = (params.get("status") or "").strip().upper()
        if state:
            queryset = queryset.filter(status=state)

        rating = (params.get("rating") or "").strip()
        if rating.isdigit() and MIN_RATING <= int(rating) <= MAX_RATING:
            queryset = queryset.filter(rating=int(rating))

        return queryset

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            "DELETE",
            detail=(
                "Reviews are never deleted. Hide or reject it instead, so the "
                "decision and who made it stay on the record."
            ),
        )

    # --- writing ------------------------------------------------------------

    @extend_schema(
        summary="Write a review", request=ReviewCreateSerializer, responses={201: ReviewSerializer}
    )
    def create(self, request, *args, **kwargs):
        serializer = ReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Resolved through the caller's own enrolment scope. An enrolment that
        # is not theirs is "no such enrolment" rather than "not yours" - the
        # same reason every other lookup here answers 404 instead of 403.
        enrollment = (
            scope_enrollments(Enrollment.objects.select_related("course", "student"), request.user)
            .filter(pk=serializer.validated_data["enrollment_id"])
            .first()
        )
        if enrollment is None:
            raise ValidationError({"enrollment_id": "No such enrolment."})

        if enrollment.student_id != request.user.pk:
            # Staff hold no review.create permission, so this is unreachable
            # today. It stays because "only the student who took the course
            # may review it" must not depend on the permission matrix staying
            # exactly as it is.
            raise PermissionDenied("You can only review your own enrolment.")

        try:
            check_reviewable(enrollment)
        except ReviewError as exc:
            return _review_error(str(exc))

        serializer.validated_data["enrollment"] = enrollment
        review = serializer.save()

        record(
            AuditAction.REVIEW_CREATED,
            actor=request.user,
            obj=review,
            new={"rating": review.rating, "course": enrollment.course.public_id},
            label=f"Review of {enrollment.course.public_id}",
        )
        logger.info(
            "Review %s written for %s by %s",
            review.pk,
            enrollment.course.public_id,
            request.user.public_id,
        )
        return Response(
            ReviewSerializer(review, context=self.get_serializer_context()).data,
            status=http_status.HTTP_201_CREATED,
        )

    @extend_schema(
        summary="Correct your review",
        request=ReviewUpdateSerializer,
        responses={200: ReviewSerializer},
    )
    def partial_update(self, request, *args, **kwargs):
        review = self.get_object()

        if review.enrollment.student_id != request.user.pk:
            raise PermissionDenied("You can only edit your own review.")

        if review.is_moderated:
            return _review_error(
                "This review has already been moderated and can no longer be edited."
            )

        serializer = ReviewUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        before = {"rating": review.rating, "comment": review.comment}
        for field, value in serializer.validated_data.items():
            setattr(review, field, value)
        review.save(update_fields=["rating", "comment", "updated_at"])

        old, new = diff(before, {"rating": review.rating, "comment": review.comment})
        if new:
            record(
                AuditAction.REVIEW_UPDATED,
                actor=request.user,
                obj=review,
                old=old,
                new=new,
                label=f"Review of {review.enrollment.course.public_id}",
            )
        return Response(ReviewSerializer(review, context=self.get_serializer_context()).data)

    # --- moderation ---------------------------------------------------------

    @extend_schema(
        summary="Moderate a review", request=ModerationSerializer, responses={200: ReviewSerializer}
    )
    @action(detail=True, methods=["post"])
    def moderate(self, request, pk=None):
        review = self.get_object()
        serializer = ModerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            review = moderate(
                review,
                actor=request.user,
                status=serializer.validated_data["status"],
                admin_response=serializer.validated_data.get("admin_response", ""),
            )
        except ReviewError as exc:
            return _review_error(str(exc))

        logger.info(
            "Review %s moderated to %s by %s", review.pk, review.status, request.user.public_id
        )
        return Response(ReviewSerializer(review, context=self.get_serializer_context()).data)

    # --- aggregate ----------------------------------------------------------

    @extend_schema(
        summary="Rating summary per course",
        parameters=[OpenApiParameter("course", str, description="Course public ID.")],
        responses={200: CourseRatingSerializer(many=True)},
        description=(
            "Averages over approved reviews only, and only over reviews the "
            "caller may read. Computed on read - a stored average cannot be "
            "re-derived once a review is hidden."
        ),
    )
    @action(detail=False, methods=["get"])
    def summary(self, request):
        courses = scope_courses(Course.objects.all(), request.user)

        requested = (request.query_params.get("course") or "").strip()
        if requested:
            courses = courses.filter(public_id__iexact=requested)

        # Published reviews only, and only the ones this caller may read, so a
        # pending complaint cannot be inferred from a shifting average.
        visible = scope_reviews(Review.objects.all(), request.user).filter(
            status=ReviewStatus.APPROVED
        )

        counted = {
            row["enrollment__course"]: row
            for row in visible.values("enrollment__course").annotate(
                n=Count("id"), avg=Avg("rating")
            )
        }
        spread: dict[int, dict[str, int]] = {}
        for row in visible.values("enrollment__course", "rating").annotate(n=Count("id")):
            course_id = row["enrollment__course"]
            spread.setdefault(course_id, {})[str(row["rating"])] = row["n"]

        rows = []
        for course in courses.order_by("public_id"):
            stats = counted.get(course.pk)
            distribution = {str(star): 0 for star in range(MIN_RATING, MAX_RATING + 1)}
            distribution.update(spread.get(course.pk, {}))

            rows.append(
                {
                    "course_public_id": course.public_id,
                    "course_title": course.title,
                    "review_count": stats["n"] if stats else 0,
                    "average_rating": round(stats["avg"], 2) if stats else None,
                    "distribution": distribution,
                }
            )

        return Response(CourseRatingSerializer(rows, many=True).data)
