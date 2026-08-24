"""
The three reports, as functions of (user, filters).

Every one of them takes the caller and narrows through the *same* scoping
helpers the API uses. That is the point of this module existing separately
from the views: the CSV export runs in a Celery worker with no request, and if
it built its own queryset it would sooner or later build an unscoped one. A
report that emails a professor the whole institute's revenue is one forgotten
filter away, and it would not be caught by any test of the HTTP layer.

Every figure is computed from rows on each call. Nothing is cached, nothing is
materialised, and the totals reconcile against the payments table by
construction because they are read from it.
"""

from datetime import date

from django.db.models import Count, Q, Sum

from apps.courses.scoping import scope_enrollments
from apps.enrollments.models import Enrollment, EnrollmentStatus
from apps.payments.models import Payment, PaymentStatus
from apps.payments.scoping import scope_payments

# Report name -> the permission it needs. Financial reports are separated
# from operational ones because reception and professors legitimately hold
# report.view_operational and must never reach revenue through it.
REPORT_PERMISSIONS = {
    "revenue": "report.view_financial",
    "outstanding": "report.view_financial",
    "enrollments": "report.view_operational",
}


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def _apply_period(queryset, filters: dict, field: str):
    start = parse_date(filters.get("from"))
    end = parse_date(filters.get("to"))
    if start:
        queryset = queryset.filter(**{f"{field}__gte": start})
    if end:
        queryset = queryset.filter(**{f"{field}__lte": end})
    return queryset


def revenue(user, filters: dict) -> dict:
    """
    Money actually collected, grouped by course.

    APPROVED only. Counting pending payments as revenue is how an institute
    decides it can afford something on the strength of a bank slip that turns
    out to be a screenshot.
    """
    payments = scope_payments(Payment.objects.all(), user).filter(status=PaymentStatus.APPROVED)
    payments = _apply_period(payments, filters, "paid_on")

    course = (filters.get("course") or "").strip()
    if course:
        payments = payments.filter(enrollment__course__public_id__iexact=course)

    rows = [
        {
            "course_public_id": row["enrollment__course__public_id"],
            "course_title": row["enrollment__course__title"],
            "payment_count": row["n"],
            "collected_minor": row["total"] or 0,
            "currency": row["enrollment__currency"],
        }
        for row in payments.values(
            "enrollment__course__public_id",
            "enrollment__course__title",
            "enrollment__currency",
        )
        .annotate(n=Count("id"), total=Sum("amount_minor"))
        .order_by("-total")
    ]

    return {
        "report": "revenue",
        "filters": filters,
        "rows": rows,
        "totals": {
            "payment_count": sum(row["payment_count"] for row in rows),
            "collected_minor": sum(row["collected_minor"] for row in rows),
        },
    }


def outstanding(user, filters: dict) -> dict:
    """
    What each live enrolment still owes.

    Remaining is the frozen enrolment price minus approved payments. Pending
    payments are reported beside it, not subtracted from it - a family whose
    cheque has not cleared still owes the money, and telling reception
    otherwise is how a debt quietly disappears.
    """
    enrollments = scope_enrollments(
        Enrollment.objects.select_related("student", "course"), user
    ).exclude(status__in=[EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED])

    course = (filters.get("course") or "").strip()
    if course:
        enrollments = enrollments.filter(course__public_id__iexact=course)

    enrollments = enrollments.annotate(
        paid=Sum("payments__amount_minor", filter=Q(payments__status=PaymentStatus.APPROVED)),
        pending=Sum("payments__amount_minor", filter=Q(payments__status=PaymentStatus.PENDING)),
    )

    rows = []
    for enrollment in enrollments.order_by("course__public_id", "student__public_id"):
        paid = enrollment.paid or 0
        pending = enrollment.pending or 0
        remaining = enrollment.price_at_enrollment_minor - paid
        if filters.get("unpaid_only") and remaining <= 0:
            continue
        rows.append(
            {
                "student_public_id": enrollment.student.public_id,
                "student_name": enrollment.student.get_full_name(),
                "course_public_id": enrollment.course.public_id,
                "course_title": enrollment.course.title,
                "status": enrollment.status,
                "total_minor": enrollment.price_at_enrollment_minor,
                "paid_minor": paid,
                "pending_minor": pending,
                "remaining_minor": remaining,
                "currency": enrollment.currency,
            }
        )

    return {
        "report": "outstanding",
        "filters": filters,
        "rows": rows,
        "totals": {
            "enrollment_count": len(rows),
            "total_minor": sum(row["total_minor"] for row in rows),
            "paid_minor": sum(row["paid_minor"] for row in rows),
            "remaining_minor": sum(row["remaining_minor"] for row in rows),
        },
    }


def enrollments(user, filters: dict) -> dict:
    """
    Head-count per course, broken down by status.

    Operational, so no money appears in it at all - not even a course price.
    This is the report reception and professors can reach, and the whole
    reason for splitting operational from financial is that this one is safe
    for them to have.
    """
    queryset = scope_enrollments(Enrollment.objects.select_related("course"), user)
    queryset = _apply_period(queryset, filters, "enrolled_at__date")

    course = (filters.get("course") or "").strip()
    if course:
        queryset = queryset.filter(course__public_id__iexact=course)

    grouped: dict[str, dict] = {}
    for row in (
        queryset.values("course__public_id", "course__title", "status")
        .annotate(n=Count("id"))
        .order_by("course__public_id")
    ):
        entry = grouped.setdefault(
            row["course__public_id"],
            {
                "course_public_id": row["course__public_id"],
                "course_title": row["course__title"],
                "total": 0,
                **{status: 0 for status in EnrollmentStatus.values},
            },
        )
        entry[row["status"]] = row["n"]
        entry["total"] += row["n"]

    rows = list(grouped.values())
    return {
        "report": "enrollments",
        "filters": filters,
        "rows": rows,
        "totals": {
            "course_count": len(rows),
            "enrollment_count": sum(row["total"] for row in rows),
        },
    }


RUNNERS = {
    "revenue": revenue,
    "outstanding": outstanding,
    "enrollments": enrollments,
}


def run(name: str, user, filters: dict) -> dict:
    try:
        runner = RUNNERS[name]
    except KeyError:
        raise ValueError(f"No report named {name!r}.") from None
    return runner(user, filters or {})
