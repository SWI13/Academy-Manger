"""
Every figure the logistics screens show, computed here and nowhere else.

The rule the rest of this codebase already follows: totals belong to the
backend. A browser that adds up a page of 25 rows and calls it "total
expenses" will disagree with the ledger the moment a filter is applied or a
second page exists, and the person at the desk believes the screen.

So the dashboard tiles, the per-category breakdowns, the monthly history and
the printed report's footer all come from these functions. The frontend
formats what it is given and adds nothing up.

Aggregation is grouped rather than counted one query at a time. A dashboard
that every member of staff loads on every visit is the wrong place for eight
COUNT(*) round trips.
"""

from datetime import date

from django.db.models import Count, Q, Sum

from .models import (
    Category,
    CategoryKind,
    Expense,
    ItemCondition,
    ItemStatus,
    Location,
    LogisticsItem,
)


# One month back from `(year, month)`, without dateutil.
def _previous_period(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def current_period() -> tuple[int, int]:
    today = date.today()
    return today.year, today.month


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------
def inventory_overview(queryset=None) -> dict:
    """
    The state of the institute's equipment.

    Counted two ways throughout, because both questions are asked: `items` is
    how many lines of the inventory match, `units` is how many actual objects
    they describe. "12 items needing repair" and "12 chairs needing repair"
    are different sentences and the second is usually the one meant.

    `queryset` is the caller's already-scoped and already-filtered queryset,
    so an overview rendered beside a filtered list describes that same list.
    """
    items = LogisticsItem.objects.all() if queryset is None else queryset

    totals = items.aggregate(items=Count("id"), units=Sum("quantity"))

    # One pass for every condition and status tile. Conditional aggregation
    # rather than eight queries: the tiles are always shown together.
    tallies = items.aggregate(
        needs_repair_items=Count("id", filter=Q(condition=ItemCondition.NEEDS_REPAIR)),
        needs_repair_units=Sum("quantity", filter=Q(condition=ItemCondition.NEEDS_REPAIR)),
        damaged_items=Count("id", filter=Q(condition=ItemCondition.DAMAGED)),
        damaged_units=Sum("quantity", filter=Q(condition=ItemCondition.DAMAGED)),
        missing_items=Count("id", filter=Q(status=ItemStatus.MISSING)),
        missing_units=Sum("quantity", filter=Q(status=ItemStatus.MISSING)),
        under_repair_items=Count("id", filter=Q(status=ItemStatus.UNDER_REPAIR)),
        under_repair_units=Sum("quantity", filter=Q(status=ItemStatus.UNDER_REPAIR)),
        available_items=Count("id", filter=Q(status=ItemStatus.AVAILABLE)),
        available_units=Sum("quantity", filter=Q(status=ItemStatus.AVAILABLE)),
        in_use_items=Count("id", filter=Q(status=ItemStatus.IN_USE)),
        in_use_units=Sum("quantity", filter=Q(status=ItemStatus.IN_USE)),
    )

    def group(field: str, label_field: str):
        rows = (
            items.values(field, label_field)
            .annotate(items=Count("id"), units=Sum("quantity"))
            .order_by("-units", label_field)
        )
        return [
            {
                "key": str(row[field]) if row[field] is not None else "",
                "label": row[label_field] or "",
                "items": row["items"],
                "units": row["units"] or 0,
            }
            for row in rows
        ]

    # Every condition, including the ones with nothing in them. A breakdown
    # that omits "Damaged" when nothing is damaged reads as a breakdown that
    # forgot to look.
    condition_rows = {
        row["condition"]: row
        for row in items.values("condition").annotate(items=Count("id"), units=Sum("quantity"))
    }
    by_condition = [
        {
            "key": value,
            "label": label,
            "items": condition_rows.get(value, {}).get("items", 0),
            "units": condition_rows.get(value, {}).get("units") or 0,
        }
        for value, label in ItemCondition.choices
    ]

    return {
        "items_total": totals["items"] or 0,
        "units_total": totals["units"] or 0,
        "needs_repair_items": tallies["needs_repair_items"] or 0,
        "needs_repair_units": tallies["needs_repair_units"] or 0,
        "damaged_items": tallies["damaged_items"] or 0,
        "damaged_units": tallies["damaged_units"] or 0,
        "missing_items": tallies["missing_items"] or 0,
        "missing_units": tallies["missing_units"] or 0,
        "under_repair_items": tallies["under_repair_items"] or 0,
        "under_repair_units": tallies["under_repair_units"] or 0,
        "available_items": tallies["available_items"] or 0,
        "available_units": tallies["available_units"] or 0,
        "in_use_items": tallies["in_use_items"] or 0,
        "in_use_units": tallies["in_use_units"] or 0,
        # "Total chairs, total tables, total TVs" - from the category rows, so
        # the tile for a category invented this morning appears without a
        # deploy. That is the whole reason categories are a table.
        "by_category": group("category_id", "category__name"),
        "by_condition": by_condition,
        "by_location": group("location_id", "location__name"),
        "categories_total": Category.objects.filter(kind=CategoryKind.ITEM, is_active=True).count(),
        "locations_total": Location.objects.filter(is_active=True).count(),
    }


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------
def _period_total(queryset, year: int, month: int) -> int:
    total = queryset.filter(period_year=year, period_month=month).aggregate(
        total=Sum("amount_minor")
    )["total"]
    return total or 0


def expense_summary(year: int, month: int, queryset=None) -> dict:
    """
    One month, in the context of its year and the month before it.

    The comparison is the point of the tile: a bare "110,000 DZD" says
    nothing, and "110,000, up 15,000 on February" is the sentence somebody
    acts on. `change_minor` is signed - negative is a month that cost less.
    """
    expenses = Expense.objects.all() if queryset is None else queryset

    month_total = _period_total(expenses, year, month)
    previous_year, previous_month = _previous_period(year, month)
    previous_total = _period_total(expenses, previous_year, previous_month)

    in_month = expenses.filter(period_year=year, period_month=month)

    by_category = [
        {
            "key": str(row["category_id"]),
            "label": row["category__name"] or "",
            "total_minor": row["total"] or 0,
            "count": row["count"],
        }
        for row in in_month.values("category_id", "category__name")
        .annotate(total=Sum("amount_minor"), count=Count("id"))
        .order_by("-total")
    ]

    monthly = months_in_year(year, queryset=expenses)

    return {
        "year": year,
        "month": month,
        "currency": "DZD",
        "month_total_minor": month_total,
        "month_count": in_month.count(),
        "previous_year": previous_year,
        "previous_month": previous_month,
        "previous_total_minor": previous_total,
        # Signed on purpose. The screen decides whether up is bad; the API
        # only says which way it moved.
        "change_minor": month_total - previous_total,
        "year_total_minor": expenses.filter(period_year=year).aggregate(total=Sum("amount_minor"))[
            "total"
        ]
        or 0,
        "by_category": by_category,
        "monthly": monthly,
    }


def months_in_year(year: int, queryset=None) -> list[dict]:
    """
    Twelve rows, including the empty ones.

    A chart or a comparison strip needs January to exist even when nothing was
    spent in it; leaving the month out entirely is how a bar chart silently
    shifts every column one place to the left.
    """
    expenses = Expense.objects.all() if queryset is None else queryset

    totals = {
        row["period_month"]: (row["total"] or 0, row["count"])
        for row in expenses.filter(period_year=year)
        .values("period_month")
        .annotate(total=Sum("amount_minor"), count=Count("id"))
    }

    return [
        {
            "year": year,
            "month": month,
            "total_minor": totals.get(month, (0, 0))[0],
            "count": totals.get(month, (0, 0))[1],
        }
        for month in range(1, 13)
    ]


def expense_history(queryset=None, *, year: int | None = None, limit: int = 36) -> list[dict]:
    """
    The months that actually have expenses, newest first, with their heaviest
    category named.

    This is the "previous months" table. Empty months are left out here - the
    opposite decision to `months_in_year`, and deliberately so: a history
    table of thirty-six rows in which twenty are zero is a table nobody
    scrolls.
    """
    expenses = Expense.objects.all() if queryset is None else queryset
    if year is not None:
        expenses = expenses.filter(period_year=year)

    periods = list(
        expenses.values("period_year", "period_month")
        .annotate(total=Sum("amount_minor"), count=Count("id"))
        .order_by("-period_year", "-period_month")[:limit]
    )
    if not periods:
        return []

    # The leading category for each of those months, in one query rather than
    # one per row. A history of three years is thirty-six months, and
    # thirty-six extra round trips to name a column is a page that loads
    # visibly slowly for no reason.
    wanted = Q()
    for period in periods:
        wanted |= Q(period_year=period["period_year"], period_month=period["period_month"])

    leaders: dict[tuple[int, int], dict] = {}
    for row in (
        expenses.filter(wanted)
        .values("period_year", "period_month", "category_id", "category__name")
        .annotate(total=Sum("amount_minor"))
        .order_by("-total")
    ):
        key = (row["period_year"], row["period_month"])
        # Ordered by total descending, so the first row seen for a month is
        # its heaviest category.
        leaders.setdefault(key, row)

    history = []
    for period in periods:
        key = (period["period_year"], period["period_month"])
        leader = leaders.get(key)
        history.append(
            {
                "year": period["period_year"],
                "month": period["period_month"],
                "total_minor": period["total"] or 0,
                "count": period["count"],
                "top_category": (leader or {}).get("category__name") or "",
                "top_category_total_minor": (leader or {}).get("total") or 0,
                "currency": "DZD",
            }
        )
    return history
