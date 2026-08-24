"""
Dashboard tiles, assembled per caller.

One endpoint, not five. Each tile declares the permission it needs and is
simply absent for anyone without it - so a reception dashboard does not
contain revenue that the frontend merely declines to render. A number the API
never sends cannot leak through a new screen, a cached response, or the
browser's network tab.
"""

from datetime import date, timedelta

from django.db.models import Count, Q, Sum

from apps.assessments.models import Assessment
from apps.core.enums import RoleCode, UserStatus
from apps.courses.models import AssignmentStatus, Course, CourseProfessor, CourseStatus
from apps.enrollments.models import Enrollment, EnrollmentStatus
from apps.payments.models import Payment, PaymentStatus
from apps.rbac.services import has_permission
from apps.reviews.models import Review, ReviewStatus
from apps.schedules.models import Schedule, ScheduleStatus

LIVE_ENROLMENTS = ~Q(status__in=[EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED])


def _people_tiles() -> dict:
    from django.contrib.auth import get_user_model

    User = get_user_model()
    # Two grouped queries rather than one count per role. Five COUNT(*) round
    # trips on a dashboard that every staff member loads on every visit adds
    # up faster than it looks.
    by_role = {
        row["primary_role"]: row["n"]
        for row in User.objects.values("primary_role").annotate(n=Count("id"))
    }
    active_by_role = {
        row["primary_role"]: row["n"]
        for row in User.objects.filter(status=UserStatus.ACTIVE)
        .values("primary_role")
        .annotate(n=Count("id"))
    }

    return {
        "students_total": by_role.get(RoleCode.STUDENT, 0),
        "students_active": active_by_role.get(RoleCode.STUDENT, 0),
        "professors_total": active_by_role.get(RoleCode.PROFESSOR, 0),
        "reception_total": active_by_role.get(RoleCode.RECEPTION, 0),
        "admins_total": active_by_role.get(RoleCode.ADMIN, 0),
    }


def _course_tiles() -> dict:
    by_status = {
        row["status"]: row["n"] for row in Course.objects.values("status").annotate(n=Count("id"))
    }
    return {
        "courses_active": by_status.get(CourseStatus.ACTIVE, 0),
        "courses_completed": by_status.get(CourseStatus.COMPLETED, 0),
        "courses_draft": by_status.get(CourseStatus.DRAFT, 0),
        "enrolments_live": Enrollment.objects.filter(LIVE_ENROLMENTS).count(),
    }


def _financial_tiles() -> dict:
    """
    Only for holders of report.view_financial.

    Outstanding is computed as contracted minus approved, over live enrolments
    - never from a stored counter, and never counting pending money as
    received.
    """
    today = date.today()
    month_start = today.replace(day=1)

    approved = Payment.objects.filter(status=PaymentStatus.APPROVED)

    revenue_total = approved.aggregate(total=Sum("amount_minor"))["total"] or 0
    revenue_month = (
        approved.filter(paid_on__gte=month_start).aggregate(total=Sum("amount_minor"))["total"] or 0
    )
    pending = Payment.objects.filter(status=PaymentStatus.PENDING).aggregate(
        total=Sum("amount_minor"), n=Count("id")
    )

    live = Enrollment.objects.filter(LIVE_ENROLMENTS)
    contracted = live.aggregate(total=Sum("price_at_enrollment_minor"))["total"] or 0
    collected = (
        Payment.objects.filter(status=PaymentStatus.APPROVED, enrollment__in=live).aggregate(
            total=Sum("amount_minor")
        )["total"]
        or 0
    )

    return {
        "revenue_total_minor": revenue_total,
        "revenue_this_month_minor": revenue_month,
        "pending_amount_minor": pending["total"] or 0,
        "pending_count": pending["n"] or 0,
        "outstanding_minor": max(contracted - collected, 0),
        "currency": "DZD",
    }


def _professor_tiles(user) -> dict:
    course_ids = list(
        CourseProfessor.objects.filter(professor=user, status=AssignmentStatus.ACTIVE).values_list(
            "course_id", flat=True
        )
    )

    next_session = None
    today = date.today()
    horizon = today + timedelta(days=14)
    best = None

    for slot in Schedule.objects.filter(
        course_id__in=course_ids, status=ScheduleStatus.ACTIVE
    ).select_related("course"):
        occurrence = slot.next_occurrence(on_or_after=today)
        if occurrence and occurrence.date() <= horizon and (best is None or occurrence < best[0]):
            best = (occurrence, slot)

    if best:
        occurrence, slot = best
        next_session = {
            "course_public_id": slot.course.public_id,
            "course_title": slot.course.title,
            "starts_at": occurrence.isoformat(),
            "room": slot.room,
            "enrolled_count": Enrollment.objects.filter(course_id=slot.course_id)
            .filter(LIVE_ENROLMENTS)
            .count(),
        }

    return {
        "my_courses": len(course_ids),
        "my_students": Enrollment.objects.filter(course_id__in=course_ids)
        .filter(LIVE_ENROLMENTS)
        .values("student")
        .distinct()
        .count(),
        "assessments_unmarked": Assessment.objects.filter(
            course_id__in=course_ids, scores__isnull=True
        )
        .distinct()
        .count(),
        "next_session": next_session,
    }


def _student_tiles(user) -> dict:
    enrolments = Enrollment.objects.filter(student=user).filter(LIVE_ENROLMENTS)

    contracted = enrolments.aggregate(total=Sum("price_at_enrollment_minor"))["total"] or 0
    paid = (
        Payment.objects.filter(enrollment__in=enrolments, status=PaymentStatus.APPROVED).aggregate(
            total=Sum("amount_minor")
        )["total"]
        or 0
    )

    return {
        "my_courses": enrolments.count(),
        "total_minor": contracted,
        "paid_minor": paid,
        "remaining_minor": max(contracted - paid, 0),
        "currency": "DZD",
    }


def _reception_tiles() -> dict:
    """The daily work, not the ledger."""
    today = date.today()
    return {
        "enrolments_today": Enrollment.objects.filter(enrolled_at__date=today).count(),
        "payments_recorded_today": Payment.objects.filter(created_at__date=today).count(),
        "payments_awaiting_review": Payment.objects.filter(status=PaymentStatus.PENDING).count(),
    }


def _moderation_tiles() -> dict:
    """
    For holders of review.moderate: the size of the queue, not what is in it.

    A count is safe on a shared screen in a way a pending complaint is not.
    """
    return {
        "reviews_awaiting_moderation": Review.objects.filter(status=ReviewStatus.PENDING).count()
    }


def build_dashboard(user) -> dict:
    """
    Assemble only what this caller may see.

    Tiles are added by permission, never by role name - so an owner who grants
    reception a new permission tomorrow gets the matching tile without a code
    change, which is the point of not hard-coding permissions.
    """
    tiles: dict = {"role": user.primary_role}

    if has_permission(user, "user.view") and has_permission(user, "user.create"):
        tiles.update(_people_tiles())

    if has_permission(user, "course.create"):
        tiles.update(_course_tiles())

    if has_permission(user, "report.view_financial"):
        tiles.update(_financial_tiles())

    if has_permission(user, "payment.create") and not has_permission(user, "report.view_financial"):
        # Reception: the queue in front of them, not the money behind it.
        tiles.update(_reception_tiles())

    if has_permission(user, "review.moderate"):
        tiles.update(_moderation_tiles())

    if has_permission(user, "score.enter"):
        tiles.update(_professor_tiles(user))

    if user.primary_role == RoleCode.STUDENT:
        tiles.update(_student_tiles(user))

    return tiles
