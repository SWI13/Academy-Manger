"""
Taking and reading registers.

The register is a PUT of the whole sheet, exactly like the mark sheet, and for
the same reason: a professor marking forty names on institute Wi-Fi either
saves all of them or none.

`GET .../sheet/` answers with the roster whether or not the register has been
taken - names down the page, with whatever has already been marked filled in.
That is what makes an untaken register printable as a blank sheet somebody can
fill in by hand, which is how a register is often actually taken.
"""

import logging
from datetime import date

from django.db.models import Count, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status as http_status
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.printing import PrintableMixin, print_response_serializer, print_schema
from apps.core.viewsets import ScopedModelViewSet, ScopedReadOnlyModelViewSet
from apps.courses.models import Course
from apps.courses.scoping import scope_courses
from apps.enrollments.models import Enrollment, EnrollmentStatus
from apps.rbac.permissions import RequirePermission
from apps.rbac.services import has_permission

from . import services
from .models import AttendanceRecord, AttendanceSession, AttendanceStatus
from .scoping import can_record_for_course, scope_records, scope_sessions
from .serializers import (
    AttendanceRecordSerializer,
    AttendanceSessionSerializer,
    AttendanceSessionWriteSerializer,
    AttendanceSummarySerializer,
    RegisterResultSerializer,
    RegisterSerializer,
    SessionSheetSerializer,
)

logger = logging.getLogger(__name__)

AttendanceSessionPrintSerializer = print_response_serializer(
    AttendanceSessionSerializer, "AttendanceSessionPrint"
)
AttendanceRecordPrintSerializer = print_response_serializer(
    AttendanceRecordSerializer, "AttendanceRecordPrint"
)

DEAD_STATUSES = [EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED]

#: For querysets rooted at Enrollment.
LIVE_ENROLMENTS = ~Q(status__in=DEAD_STATUSES)
#: For a queryset rooted at AttendanceSession reaching across to enrolments.
#: Spelling the path out matters: a bare `status` in that join resolves to the
#: *session's* status column, and the roster count would silently count the
#: wrong thing.
LIVE_COURSE_ENROLMENTS = ~Q(course__enrollments__status__in=DEAD_STATUSES)


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def sees_whole_room(user) -> bool:
    """
    Whether this caller reads a register as a list of people or as their own line.

    Staff and the professor teaching the course see everybody; a student sees
    themselves. Expressed as permissions rather than roles, so an owner who
    grants reception something tomorrow gets the matching answer without a
    code change.
    """
    return (
        has_permission(user, "course.create")
        or has_permission(user, "enrollment.create")
        or has_permission(user, "attendance.record")
    )


@extend_schema_view(
    list=extend_schema(
        summary="List registers",
        parameters=[
            OpenApiParameter("course", str, description="Course public ID."),
            OpenApiParameter("from", str, description="Held on or after (ISO date)."),
            OpenApiParameter("to", str, description="Held on or before (ISO date)."),
            OpenApiParameter("status", str, description="OPEN or SUBMITTED."),
        ],
    )
)
@print_schema(AttendanceSessionPrintSerializer)
class AttendanceSessionViewSet(PrintableMixin, ScopedModelViewSet):
    """
    One register per course per day.

    There is no DELETE. A register that was taken is a record of who was in a
    room on a date, and the platform's rule is that such records are not
    destroyed - a register opened by mistake on the wrong day is corrected by
    changing its date, which leaves a trail.
    """

    queryset = AttendanceSession.objects.select_related("course", "schedule")
    # DELETE is routed so `destroy` can answer 405 rather than letting the
    # permission layer answer 403 first - "nobody deletes a register" is the
    # truthful reply, and "you may not" would send an owner looking for a
    # permission that does not exist.
    http_method_names = ["get", "post", "patch", "put", "delete", "head", "options"]

    required_permissions = {
        "list": "attendance.view",
        "retrieve": "attendance.view",
        "printable": "attendance.view",
        "sheet": "attendance.view",
        "create": "attendance.record",
        "partial_update": "attendance.record",
        "register": "attendance.record",
        # Mapped only so destroy() is reached and can answer 405.
        "destroy": "attendance.record",
    }

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            "DELETE",
            detail=(
                "Registers are not deleted - one is a record of who was in a room "
                "on a date. Correct the date instead, which leaves a trail."
            ),
        )

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return AttendanceSessionWriteSerializer
        return AttendanceSessionSerializer

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .annotate(
                present_count=Count("records", filter=Q(records__status=AttendanceStatus.PRESENT)),
                absent_count=Count("records", filter=Q(records__status=AttendanceStatus.ABSENT)),
                late_count=Count("records", filter=Q(records__status=AttendanceStatus.LATE)),
                marked_count=Count("records"),
                roster_count=Count(
                    "course__enrollments",
                    filter=LIVE_COURSE_ENROLMENTS,
                    distinct=True,
                ),
            )
            .order_by("-held_on", "-created_at")
        )
        params = self.request.query_params

        course = (params.get("course") or "").strip()
        if course:
            queryset = queryset.filter(course__public_id__iexact=course)

        start = _parse_date(params.get("from"))
        if start:
            queryset = queryset.filter(held_on__gte=start)

        end = _parse_date(params.get("to"))
        if end:
            queryset = queryset.filter(held_on__lte=end)

        state = (params.get("status") or "").strip().upper()
        if state:
            queryset = queryset.filter(status=state)

        return queryset

    def scope_queryset(self, queryset, user):
        return scope_sessions(queryset, user)

    def get_print_queryset(self):
        # Oldest first on paper. A term's registers read down the page in the
        # order the term ran, which is the opposite of a screen where the most
        # recent one belongs at the top.
        return self.filter_queryset(self.get_queryset()).order_by("held_on")

    def perform_create(self, serializer):
        course = serializer.validated_data["course"]
        if not can_record_for_course(self.request.user, course):
            raise PermissionDenied("You are not assigned to that course.")
        serializer.save(opened_by=self.request.user)

    def create(self, request, *args, **kwargs):
        """
        Opening a register that already exists returns the existing one.

        Two professors opening Tuesday's register at the same moment is
        ordinary, and answering the second with a uniqueness error they have
        to interpret would send them looking for a register they are already
        entitled to. 200 rather than 201 says which happened.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        course = serializer.validated_data.get("course")
        held_on = serializer.validated_data.get("held_on")
        existing = AttendanceSession.objects.filter(course=course, held_on=held_on).first()
        if existing:
            if not can_record_for_course(request.user, existing.course):
                raise PermissionDenied("You are not assigned to that course.")
            return Response(
                AttendanceSessionSerializer(
                    self.get_queryset().get(pk=existing.pk),
                    context=self.get_serializer_context(),
                ).data
            )

        self.perform_create(serializer)
        return Response(
            AttendanceSessionSerializer(
                self.get_queryset().get(pk=serializer.instance.pk),
                context=self.get_serializer_context(),
            ).data,
            status=http_status.HTTP_201_CREATED,
        )

    @extend_schema(
        summary="The register, roster and all",
        responses={200: SessionSheetSerializer},
    )
    @action(detail=True, methods=["get"], url_path="sheet")
    def sheet(self, request, pk=None):
        """
        Every name on the course, with whatever has been marked filled in.

        This is what both the screen and the printed sheet render. A register
        nobody has taken yet answers with the roster and blank statuses, which
        is exactly the blank sheet a professor carries into the room.
        """
        session = self.get_object()

        marked = {
            row.enrollment_id: row
            for row in scope_records(
                AttendanceRecord.objects.filter(session=session).select_related(
                    "enrollment__student"
                ),
                request.user,
            )
        }

        roster = (
            Enrollment.objects.filter(course=session.course)
            .filter(LIVE_ENROLMENTS)
            .select_related("student")
            .order_by("student__last_name", "student__first_name")
        )

        # A student on this course sees their own line and nobody else's.
        # Narrowed on the queryset rather than filtered out afterwards, so
        # there is no classmate's name in the payload to find in a network
        # tab. Anybody who may write a register sees the whole room.
        if not sees_whole_room(request.user):
            roster = roster.filter(student=request.user)

        rows = []
        for enrollment in roster:
            entry = marked.get(enrollment.pk)
            rows.append(
                {
                    "enrollment": enrollment.pk,
                    "student_public_id": enrollment.student.public_id,
                    "student_name": enrollment.student.get_full_name(),
                    "status": entry.status if entry else "",
                    "minutes_late": entry.minutes_late if entry else None,
                    "note": entry.note if entry else "",
                }
            )

        return Response(
            {
                "session": AttendanceSessionSerializer(
                    self.get_queryset().get(pk=session.pk),
                    context=self.get_serializer_context(),
                ).data,
                "rows": rows,
                "totals": services.tally(
                    AttendanceRecord.objects.filter(
                        session=session, enrollment__in=[row["enrollment"] for row in rows]
                    )
                ),
            }
        )

    @extend_schema(
        summary="Save the whole register",
        request=RegisterSerializer,
        responses={200: RegisterResultSerializer},
    )
    @action(detail=True, methods=["put"], url_path="register")
    def register(self, request, pk=None):
        session = self.get_object()

        if not can_record_for_course(request.user, session.course):
            raise PermissionDenied("You are not assigned to that course.")

        serializer = RegisterSerializer(
            data=request.data, context={"request": request, "session": session}
        )
        serializer.is_valid(raise_exception=True)

        result = services.save_register(
            session, serializer.validated_data["rows"], actor=request.user
        )

        written = AttendanceRecord.objects.filter(session=session).select_related(
            "enrollment__student"
        )
        return Response({**result, "records": AttendanceRecordSerializer(written, many=True).data})


@extend_schema_view(
    list=extend_schema(
        summary="List attendance records",
        parameters=[
            OpenApiParameter("course", str, description="Course public ID."),
            OpenApiParameter("student", str, description="Student public ID."),
            OpenApiParameter("status", str, description="PRESENT, ABSENT or LATE."),
            OpenApiParameter("from", str, description="Held on or after (ISO date)."),
            OpenApiParameter("to", str, description="Held on or before (ISO date)."),
        ],
    )
)
@print_schema(AttendanceRecordPrintSerializer)
class AttendanceRecordViewSet(PrintableMixin, ScopedReadOnlyModelViewSet):
    """
    The individual marks, read-only.

    Registers are written a sheet at a time through
    `sessions/{id}/register/`, never a row at a time - so there is no create,
    update or delete here at any version. A screen that could PATCH one row
    would be a second way to write attendance, and two write paths is how one
    of them ends up without an audit trail.
    """

    queryset = AttendanceRecord.objects.select_related("session__course", "enrollment__student")

    required_permissions = {
        "list": "attendance.view",
        "retrieve": "attendance.view",
        "printable": "attendance.view",
    }

    def get_serializer_class(self):
        return AttendanceRecordSerializer

    def scope_queryset(self, queryset, user):
        return scope_records(queryset, user)

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        course = (params.get("course") or "").strip()
        if course:
            queryset = queryset.filter(session__course__public_id__iexact=course)

        student = (params.get("student") or "").strip()
        if student:
            queryset = queryset.filter(enrollment__student__public_id__iexact=student)

        state = (params.get("status") or "").strip().upper()
        if state:
            queryset = queryset.filter(status=state)

        start = _parse_date(params.get("from"))
        if start:
            queryset = queryset.filter(session__held_on__gte=start)

        end = _parse_date(params.get("to"))
        if end:
            queryset = queryset.filter(session__held_on__lte=end)

        return queryset.order_by("session__held_on", "enrollment__student__last_name")


class AttendanceSummaryView(APIView):
    """
    Attendance rates over a selection, tallied by the backend.

    Never in the browser. A percentage worked out from the twenty-five rows on
    a page is a percentage that disagrees with the register as soon as anybody
    turns to page two, and it is the figure that goes on a report a parent
    reads.
    """

    permission_classes = [RequirePermission]
    required_permission = "attendance.view"

    @extend_schema(
        summary="Attendance rates for a course, a student or a period",
        parameters=[
            OpenApiParameter("course", str, description="Course public ID."),
            OpenApiParameter("student", str, description="Student public ID."),
            OpenApiParameter("from", str, description="Held on or after (ISO date)."),
            OpenApiParameter("to", str, description="Held on or before (ISO date)."),
        ],
        responses={200: AttendanceSummarySerializer},
    )
    def get(self, request):
        params = request.query_params

        # Scoped first, filtered second. A professor asking for a course they
        # do not teach gets an empty summary rather than somebody else's
        # figures, because the scope is applied to the queryset before any
        # filter narrows it.
        records = scope_records(
            AttendanceRecord.objects.select_related("session__course", "enrollment__student"),
            request.user,
        )
        sessions = scope_sessions(AttendanceSession.objects.all(), request.user)

        course = (params.get("course") or "").strip()
        if course:
            records = records.filter(session__course__public_id__iexact=course)
            sessions = sessions.filter(course__public_id__iexact=course)

        student = (params.get("student") or "").strip()
        if student:
            records = records.filter(enrollment__student__public_id__iexact=student)

        start = _parse_date(params.get("from"))
        if start:
            records = records.filter(session__held_on__gte=start)
            sessions = sessions.filter(held_on__gte=start)

        end = _parse_date(params.get("to"))
        if end:
            records = records.filter(session__held_on__lte=end)
            sessions = sessions.filter(held_on__lte=end)

        course_row = None
        if course:
            course_row = (
                scope_courses(Course.objects.all(), request.user)
                .filter(public_id__iexact=course)
                .first()
            )

        return Response(
            {
                "totals": services.tally(records),
                "students": services.summarise_by_enrollment(records),
                "session_count": sessions.count(),
                "course_public_id": course_row.public_id if course_row else "",
                "course_title": course_row.title if course_row else "",
                "from_date": start,
                "to_date": end,
            }
        )
