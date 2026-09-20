"""
The two whole-institute documents: the financial summary, and the month's
management report.

Both exist because printing them is the point. A financial summary that a
reader has to assemble from four screens is a summary that nobody produces,
and "August 2026 Management Report" is a thing an owner hands to somebody.

Every figure is read from rows on each call, like the rest of this app. The
income side is the payments ledger and the expenditure side is the logistics
expenses table - which is what makes the net figure reconcilable: it is
subtraction over two numbers that each came from a table you can go and look
at.

---------------------------------------------------------------------------
Approved money only
---------------------------------------------------------------------------
Income counts APPROVED payments and nothing else. Counting pending money is
how an institute decides it can afford something on the strength of a bank
slip that turns out to be a screenshot. The pending figure is reported
separately and labelled, never folded into the total.
"""

from calendar import monthrange
from datetime import date

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.db.models.functions import ExtractMonth, ExtractYear

from apps.core.enums import RoleCode, UserStatus
from apps.courses.models import Course, CourseStatus
from apps.enrollments.models import Enrollment, EnrollmentStatus
from apps.logistics.models import Expense, ItemCondition, ItemStatus, LogisticsItem
from apps.payments.models import Payment, PaymentStatus

LIVE_ENROLMENTS = ~Q(status__in=[EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED])


def month_bounds(year: int, month: int) -> tuple[date, date]:
    """The first and last day of a month, inclusive at both ends."""
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def _sum(queryset, field: str = "amount_minor") -> int:
    return queryset.aggregate(total=Sum(field))["total"] or 0


def financial_summary(*, start: date | None, end: date | None) -> dict:
    """
    Income against expenditure over a date range, with both breakdowns.

    Income is dated by `paid_on` - when the money changed hands. Expenditure
    is dated by its accounting *period*, because that is what an expense
    belongs to (see the logistics module). The two are not the same kind of
    date and pretending they were would put February's electricity in March's
    column on one report and not the other.
    """
    approved = Payment.objects.filter(status=PaymentStatus.APPROVED)
    pending = Payment.objects.filter(status=PaymentStatus.PENDING)
    expenses = Expense.objects.all()

    if start:
        approved = approved.filter(paid_on__gte=start)
        pending = pending.filter(paid_on__gte=start)
        expenses = expenses.filter(
            Q(period_year__gt=start.year) | Q(period_year=start.year, period_month__gte=start.month)
        )
    if end:
        approved = approved.filter(paid_on__lte=end)
        pending = pending.filter(paid_on__lte=end)
        expenses = expenses.filter(
            Q(period_year__lt=end.year) | Q(period_year=end.year, period_month__lte=end.month)
        )

    income_total = _sum(approved)
    expense_total = _sum(expenses)

    income_by_category = [
        {
            "key": row["enrollment__course__public_id"] or "",
            "label": row["enrollment__course__title"] or "",
            "total_minor": row["total"] or 0,
            "count": row["count"],
        }
        for row in approved.values("enrollment__course__public_id", "enrollment__course__title")
        .annotate(total=Sum("amount_minor"), count=Count("id"))
        .order_by("-total")
    ]

    expenses_by_category = [
        {
            "key": str(row["category_id"]),
            "label": row["category__name"] or "",
            "total_minor": row["total"] or 0,
            "count": row["count"],
        }
        for row in expenses.values("category_id", "category__name")
        .annotate(total=Sum("amount_minor"), count=Count("id"))
        .order_by("-total")
    ]

    # Month by month across the range, so the summary carries a trend rather
    # than a single number. Built from two grouped queries rather than one per
    # month: a year's range is twelve round trips otherwise.
    monthly = _monthly_series(approved, expenses, start=start, end=end)

    return {
        "from_date": start,
        "to_date": end,
        "currency": "DZD",
        "income_total_minor": income_total,
        "income_count": approved.count(),
        # Reported beside the total and never inside it. Pending money is a
        # claim, not a receipt.
        "pending_total_minor": _sum(pending),
        "pending_count": pending.count(),
        "expense_total_minor": expense_total,
        "expense_count": expenses.count(),
        # Signed. A month that cost more than it took is a negative number,
        # and rounding that away would be the one thing a summary must not do.
        "net_minor": income_total - expense_total,
        "income_by_category": income_by_category,
        "expenses_by_category": expenses_by_category,
        "monthly": monthly,
    }


def _monthly_series(approved, expenses, *, start: date | None, end: date | None) -> list[dict]:
    """One row per month in the range, including the months with nothing in them."""
    income_rows = {
        (row["year"], row["month"]): row["total"] or 0
        for row in approved.annotate(year=ExtractYear("paid_on"), month=ExtractMonth("paid_on"))
        .values("year", "month")
        .annotate(total=Sum("amount_minor"))
    }
    expense_rows = {
        (row["period_year"], row["period_month"]): row["total"] or 0
        for row in expenses.values("period_year", "period_month").annotate(
            total=Sum("amount_minor")
        )
    }

    keys = sorted(set(income_rows) | set(expense_rows))
    if not keys:
        return []

    # Fill the gaps between the first and last month that has anything, so a
    # quiet August is a zero rather than a month the chart skips over.
    first, last = keys[0], keys[-1]
    if start:
        first = min(first, (start.year, start.month))
    if end:
        last = max(last, (end.year, end.month))

    series = []
    year, month = first
    while (year, month) <= last:
        income = income_rows.get((year, month), 0)
        spent = expense_rows.get((year, month), 0)
        series.append(
            {
                "year": year,
                "month": month,
                "income_minor": income,
                "expense_minor": spent,
                "net_minor": income - spent,
            }
        )
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)

    return series


def management_report(*, year: int, month: int) -> dict:
    """
    One month of the institute, on one sheet.

    The figures an owner is asked for at the end of a month: how many students,
    how many joined, whether they turned up, what came in, what went out, what
    is still owed, and what the place is made of.
    """
    from apps.attendance.models import AttendanceRecord, AttendanceSession
    from apps.attendance.services import tally

    start, end = month_bounds(year, month)
    User = get_user_model()

    # --- people ---------------------------------------------------------
    students_total = User.objects.filter(primary_role=RoleCode.STUDENT).count()
    students_active = User.objects.filter(
        primary_role=RoleCode.STUDENT, status=UserStatus.ACTIVE
    ).count()
    new_students = User.objects.filter(
        primary_role=RoleCode.STUDENT, created_at__date__gte=start, created_at__date__lte=end
    ).count()
    new_enrolments = Enrollment.objects.filter(
        enrolled_at__date__gte=start, enrolled_at__date__lte=end
    ).count()

    # --- teaching -------------------------------------------------------
    courses_active = Course.objects.filter(status=CourseStatus.ACTIVE).count()
    live_enrolments = Enrollment.objects.filter(LIVE_ENROLMENTS)

    # --- attendance -----------------------------------------------------
    month_records = AttendanceRecord.objects.filter(
        session__held_on__gte=start, session__held_on__lte=end
    )
    attendance = tally(month_records)
    registers_taken = AttendanceSession.objects.filter(held_on__gte=start, held_on__lte=end).count()

    # --- money ----------------------------------------------------------
    money = financial_summary(start=start, end=end)

    contracted = live_enrolments.aggregate(total=Sum("price_at_enrollment_minor"))["total"] or 0
    collected = (
        Payment.objects.filter(
            status=PaymentStatus.APPROVED, enrollment__in=live_enrolments
        ).aggregate(total=Sum("amount_minor"))["total"]
        or 0
    )

    # --- what the place is made of --------------------------------------
    inventory = LogisticsItem.objects.aggregate(
        lines=Count("id"),
        units=Sum("quantity"),
        needs_repair=Count("id", filter=Q(condition=ItemCondition.NEEDS_REPAIR)),
        damaged=Count("id", filter=Q(condition=ItemCondition.DAMAGED)),
        missing=Count("id", filter=Q(status=ItemStatus.MISSING)),
    )

    return {
        "year": year,
        "month": month,
        "from_date": start,
        "to_date": end,
        "currency": "DZD",
        # People
        "students_total": students_total,
        "students_active": students_active,
        "new_students": new_students,
        "new_enrolments": new_enrolments,
        "courses_active": courses_active,
        "enrolments_live": live_enrolments.count(),
        # Attendance
        "registers_taken": registers_taken,
        "attendance_present": attendance["present"],
        "attendance_late": attendance["late"],
        "attendance_absent": attendance["absent"],
        "attendance_rate": attendance["rate"],
        # Money
        "income_total_minor": money["income_total_minor"],
        "pending_total_minor": money["pending_total_minor"],
        "expense_total_minor": money["expense_total_minor"],
        "net_minor": money["net_minor"],
        # Contracted minus collected, over live enrolments only. Never a
        # stored counter - see the payments module.
        "outstanding_minor": max(contracted - collected, 0),
        "income_by_category": money["income_by_category"],
        "expenses_by_category": money["expenses_by_category"],
        # Logistics
        "inventory_lines": inventory["lines"] or 0,
        "inventory_units": inventory["units"] or 0,
        "inventory_needs_repair": inventory["needs_repair"] or 0,
        "inventory_damaged": inventory["damaged"] or 0,
        "inventory_missing": inventory["missing"] or 0,
    }
