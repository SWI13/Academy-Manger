"""Schedules, plus the professor's "what is next" endpoint."""

import logging
from datetime import date, datetime, timedelta

from django.db.models import Count
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.viewsets import ScopedModelViewSet
from apps.courses.scoping import scope_schedules
from apps.enrollments.models import Enrollment, EnrollmentStatus

from .models import Schedule, ScheduleStatus
from .serializers import NextSessionSerializer, ScheduleSerializer, ScheduleWriteSerializer

logger = logging.getLogger(__name__)


@extend_schema_view(
    list=extend_schema(
        summary="List schedule slots",
        parameters=[
            OpenApiParameter("course", str, description="Course public ID."),
            OpenApiParameter("weekday", int, description="0 = Monday."),
        ],
    )
)
class ScheduleViewSet(ScopedModelViewSet):
    queryset = Schedule.objects.all().select_related("course", "professor")

    required_permissions = {
        "list": "schedule.view",
        "retrieve": "schedule.view",
        "create": "schedule.manage",
        "update": "schedule.manage",
        "partial_update": "schedule.manage",
        "destroy": "schedule.manage",
        "next_session": "schedule.view",
        "my_week": "schedule.view",
    }

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ScheduleWriteSerializer
        return ScheduleSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        course = (params.get("course") or "").strip()
        if course:
            queryset = queryset.filter(course__public_id__iexact=course)

        weekday = (params.get("weekday") or "").strip()
        if weekday.isdigit():
            queryset = queryset.filter(weekday=int(weekday))

        return queryset

    def scope_queryset(self, queryset, user):
        return scope_schedules(queryset, user)

    def perform_create(self, serializer):
        schedule = serializer.save()
        if getattr(serializer, "_clashes", None):
            logger.warning(
                "Schedule %s booked over %d clash(es) by %s",
                schedule.pk,
                len(serializer._clashes),
                self.request.user.public_id,
            )

    @extend_schema(
        summary="The caller's next session",
        responses={200: NextSessionSerializer},
        description=(
            "Resolves the recurring pattern into the next concrete date and time, "
            "with the room and how many students are enrolled. Returns 204 when "
            "there is nothing upcoming."
        ),
    )
    @action(detail=False, methods=["get"], url_path="next-session")
    def next_session(self, request):
        upcoming = self._upcoming(request.user, limit=1)
        if not upcoming:
            return Response(status=204)
        return Response(NextSessionSerializer(upcoming[0]).data)

    @extend_schema(
        summary="The caller's next seven days",
        responses={200: NextSessionSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="my-week")
    def my_week(self, request):
        return Response(NextSessionSerializer(self._upcoming(request.user, days=7), many=True).data)

    def _upcoming(self, user, *, days: int = 14, limit: int | None = None) -> list[dict]:
        """
        Expand the recurring patterns this user can see into concrete sessions.

        Bounded by `days` so an open-ended course cannot generate an unbounded
        list, and sorted so "next" is genuinely next rather than merely first
        in the table.
        """
        today = date.today()
        horizon = today + timedelta(days=days)

        slots = scope_schedules(
            Schedule.objects.filter(status=ScheduleStatus.ACTIVE).select_related("course"), user
        )

        # One grouped query for every course in play, rather than a count per
        # slot - a professor with four courses twice a week is 8 slots and
        # would otherwise be 8 round trips.
        counts = {
            row["course"]: row["n"]
            for row in Enrollment.objects.filter(course__in=[s.course_id for s in slots])
            .exclude(status__in=[EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED])
            .values("course")
            .annotate(n=Count("id"))
        }

        sessions = []
        for slot in slots:
            occurrence = slot.next_occurrence(on_or_after=today)
            while occurrence and occurrence.date() <= horizon:
                sessions.append(
                    {
                        "course_public_id": slot.course.public_id,
                        "course_title": slot.course.title,
                        "starts_at": occurrence,
                        "ends_at": datetime.combine(occurrence.date(), slot.end_time),
                        "room": slot.room,
                        "weekday_name": slot.get_weekday_display(),
                        # The head-count a professor asks for. Zero for a
                        # course nobody has enrolled in yet, not absent.
                        "enrolled_count": counts.get(slot.course_id, 0),
                    }
                )
                occurrence = slot.next_occurrence(on_or_after=occurrence.date() + timedelta(days=1))

        sessions.sort(key=lambda s: s["starts_at"])
        return sessions[:limit] if limit else sessions
