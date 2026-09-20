"""
The logistics endpoints.

---------------------------------------------------------------------------
Where "reception is read-only" actually lives
---------------------------------------------------------------------------
Here, in `required_permissions`, and nowhere else that matters. Reception
holds `logistics.view` and `expense.view` and does not hold `logistics.manage`
or `expense.manage`, so every create, update and delete action is refused by
gate 2 before a serializer is ever built. Hiding the buttons is a courtesy the
frontend pays; this is the rule.

The mapping is per action rather than one `required_permission` for the whole
viewset precisely because that is the distinction being drawn - a viewset with
a single requirement would either lock reception out of the list or let them
edit the rows.

---------------------------------------------------------------------------
Scope
---------------------------------------------------------------------------
None of these resources has a per-user scope. A chair is not anybody's chair,
and an electricity bill is not scoped to whoever typed it in. `scope_queryset`
therefore returns the queryset unchanged, which `ScopedQuerysetMixin` requires
to be said out loud rather than inherited by accident.
"""

import logging

from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditAction
from apps.audit.services import diff, record, snapshot
from apps.core import printing
from apps.core.viewsets import ScopedModelViewSet
from apps.rbac.permissions import RequirePermission

from . import services
from .models import Category, CategoryKind, Expense, Location, LogisticsItem
from .serializers import (
    ExpenseHistorySerializer,
    ExpensePrintSerializer,
    ExpenseSerializer,
    ExpenseSummarySerializer,
    ExpenseWriteSerializer,
    LogisticsCategorySerializer,
    LogisticsItemSerializer,
    LogisticsItemWriteSerializer,
    LogisticsLocationSerializer,
    LogisticsOverviewSerializer,
    LogisticsPrintSerializer,
)

logger = logging.getLogger(__name__)

# The inventory sheet and the expenses sheet each carry their totals beside
# their rows, so they answer with more than `PrintableMixin` alone does and
# keep their own actions. Everything else about them - the cap, the
# permission being the same as the list's - is the shared behaviour.
PRINT_LIMIT = printing.PRINT_LIMIT

# Fields the audit log records when an item or an expense is edited. Only what
# changed is stored; see `audit.services.diff`.
ITEM_TRACKED = [
    "name",
    "quantity",
    "condition",
    "status",
    "purchase_date",
    "purchase_price_minor",
    "serial_number",
]
EXPENSE_TRACKED = [
    "name",
    "amount_minor",
    "spent_on",
    "period_year",
    "period_month",
    "method",
    "reference",
]


def _int_param(params, key: str, default: int | None = None) -> int | None:
    raw = (params.get(key) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


class NoScopeMixin:
    def scope_queryset(self, queryset, user):
        # Said explicitly, as ScopedQuerysetMixin insists. A room's chairs are
        # not scoped to a person: everyone who may see the inventory at all
        # sees all of it, and who may see it at all is gate 2's answer.
        return queryset


# ---------------------------------------------------------------------------
# Setup: categories and locations
# ---------------------------------------------------------------------------
@extend_schema_view(
    list=extend_schema(
        summary="List logistics categories",
        parameters=[
            OpenApiParameter("kind", str, description="ITEM or EXPENSE."),
            OpenApiParameter("active", str, description="true to hide retired categories."),
        ],
    )
)
class LogisticsCategoryViewSet(NoScopeMixin, ScopedModelViewSet):
    """
    The labels, as rows.

    This viewset is the answer to "add new item types without changing the
    code". There is no DELETE: a category is referenced by every row filed
    under it, and deleting one would either orphan those rows or take them
    with it. Retiring is `is_active = false`, which removes it from the
    dropdowns and leaves the history intact.
    """

    queryset = Category.objects.all()
    serializer_class = LogisticsCategorySerializer
    # DELETE is routed so `destroy` below can answer 405 rather than letting
    # the permission layer answer 403 first. "Nobody deletes a category" is
    # the truthful reply; "you may not" is not - and it would send an owner
    # looking for the permission they are missing.
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    required_permissions = {
        "list": "logistics.view",
        "retrieve": "logistics.view",
        "create": "logistics.manage",
        "partial_update": "logistics.manage",
        # Mapped only so destroy() is reached and can answer 405.
        "destroy": "logistics.manage",
    }

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            "DELETE",
            detail=(
                "Categories are retired, not deleted - every item and expense filed "
                "under one refers to it. PATCH is_active to false instead."
            ),
        )

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .annotate(
                usage_count=Count("items", distinct=True, filter=Q(items__deleted_at__isnull=True))
                + Count("expenses", distinct=True, filter=Q(expenses__deleted_at__isnull=True))
            )
            # Restated after the annotation. An aggregate over two joined
            # tables leaves DRF's paginator warning that the list is
            # unordered, and an unordered page really can repeat or skip a row
            # between page one and page two.
            .order_by("kind", "name")
        )
        params = self.request.query_params

        kind = (params.get("kind") or "").strip().upper()
        if kind in CategoryKind.values:
            queryset = queryset.filter(kind=kind)

        if (params.get("active") or "").strip().lower() == "true":
            queryset = queryset.filter(is_active=True)

        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


@extend_schema_view(list=extend_schema(summary="List rooms and stores"))
class LogisticsLocationViewSet(NoScopeMixin, ScopedModelViewSet):
    """Rooms and stores. Retired the same way categories are, and for the same reason."""

    queryset = Location.objects.all()
    serializer_class = LogisticsLocationSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    required_permissions = {
        "list": "logistics.view",
        "retrieve": "logistics.view",
        "create": "logistics.manage",
        "partial_update": "logistics.manage",
        "destroy": "logistics.manage",
    }

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            "DELETE",
            detail=("Rooms are retired, not deleted. PATCH is_active to false instead."),
        )

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .annotate(usage_count=Count("items", filter=Q(items__deleted_at__isnull=True)))
            .order_by("name")
        )
        if (self.request.query_params.get("active") or "").strip().lower() == "true":
            queryset = queryset.filter(is_active=True)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------
@extend_schema_view(
    list=extend_schema(
        summary="List inventory items",
        parameters=[
            OpenApiParameter("q", str, description="Search name, ID or serial number."),
            OpenApiParameter("category", int, description="Category id."),
            OpenApiParameter("condition", str, description="NEW, GOOD, NEEDS_REPAIR, DAMAGED."),
            OpenApiParameter(
                "status", str, description="AVAILABLE, IN_USE, UNDER_REPAIR, MISSING."
            ),
            OpenApiParameter("location", int, description="Location id."),
            OpenApiParameter(
                "ordering",
                str,
                description=(
                    "quantity, name, purchase_date, created_at, updated_at. "
                    "Prefix with - to reverse."
                ),
            ),
        ],
    )
)
class LogisticsItemViewSet(NoScopeMixin, ScopedModelViewSet):
    """
    The inventory.

    DELETE is a soft delete - see `perform_destroy`. The row leaves every list
    and every total immediately, and what the institute once owned survives
    somebody tidying up.
    """

    queryset = LogisticsItem.objects.select_related("category", "location")
    lookup_field = "public_id"
    lookup_value_regex = "LOG-[0-9]+"

    ordering_fields = ["quantity", "name", "purchase_date", "created_at", "updated_at"]

    required_permissions = {
        "list": "logistics.view",
        "retrieve": "logistics.view",
        "printable": "logistics.view",
        "create": "logistics.manage",
        "update": "logistics.manage",
        "partial_update": "logistics.manage",
        "destroy": "logistics.manage",
    }

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return LogisticsItemWriteSerializer
        return LogisticsItemSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        search = (params.get("q") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(public_id__icontains=search)
                | Q(serial_number__icontains=search)
            )

        category = _int_param(params, "category")
        if category is not None:
            queryset = queryset.filter(category_id=category)

        location = _int_param(params, "location")
        if location is not None:
            queryset = queryset.filter(location_id=location)

        condition = (params.get("condition") or "").strip().upper()
        if condition:
            queryset = queryset.filter(condition=condition)

        state = (params.get("status") or "").strip().upper()
        if state:
            queryset = queryset.filter(status=state)

        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)
        record(
            AuditAction.LOGISTICS_ITEM_CREATED,
            actor=self.request.user,
            obj=serializer.instance,
            new={
                "name": serializer.instance.name,
                "quantity": serializer.instance.quantity,
                "category": serializer.instance.category.name,
            },
        )
        logger.info(
            "Logistics item %s created by %s",
            serializer.instance.public_id,
            self.request.user.public_id,
        )

    def perform_update(self, serializer):
        before = snapshot(serializer.instance, ITEM_TRACKED)
        serializer.save(updated_by=self.request.user)
        old, new = diff(before, snapshot(serializer.instance, ITEM_TRACKED))
        if old or new:
            record(
                AuditAction.LOGISTICS_ITEM_UPDATED,
                actor=self.request.user,
                obj=serializer.instance,
                old=old,
                new=new,
            )

    def perform_destroy(self, instance):
        """
        Soft, always.

        The requirement asked for a delete button and this platform's rule is
        that nothing is destroyed. Both hold: the row is gone from every list,
        every count and every printed sheet from this moment, and the record
        of what was once owned is still there for whoever asks later.
        """
        instance.delete(deleted_by=self.request.user)
        record(
            AuditAction.LOGISTICS_ITEM_DELETED,
            actor=self.request.user,
            obj=instance,
            old={"name": instance.name, "quantity": instance.quantity},
        )
        logger.info(
            "Logistics item %s deleted by %s", instance.public_id, self.request.user.public_id
        )

    @extend_schema(
        summary="The inventory, unpaginated, for printing",
        parameters=[
            OpenApiParameter("q", str),
            OpenApiParameter("category", int),
            OpenApiParameter("condition", str),
            OpenApiParameter("status", str),
            OpenApiParameter("location", int),
        ],
        responses={200: LogisticsPrintSerializer},
    )
    @action(detail=False, methods=["get"], url_path="print", pagination_class=None)
    def printable(self, request):
        """
        The same filters as the list, without the page boundary.

        A printed inventory that silently stops at the twenty-fifth row is
        worse than no printed inventory: it looks complete.

        The totals travel with the rows and describe the same filtered set, so
        "Total items: 63" on the sheet is the number of lines below it - not
        the size of an inventory the reader is only seeing part of.
        """
        selection = self.filter_queryset(self.get_queryset())
        return Response(
            {
                "results": LogisticsItemSerializer(
                    selection[:PRINT_LIMIT], many=True, context=self.get_serializer_context()
                ).data,
                "overview": services.inventory_overview(selection),
                "printed_at": timezone.now().isoformat(),
            }
        )


class LogisticsOverviewView(APIView):
    """
    The dashboard figures.

    A view of its own rather than an action on the item viewset, because it
    describes the section rather than the collection - and because a screen
    that shows tiles above a table should be able to ask for the tiles without
    also asking for a page of rows it is not going to render.
    """

    permission_classes = [RequirePermission]
    required_permission = "logistics.view"

    @extend_schema(summary="Inventory overview", responses={200: LogisticsOverviewSerializer})
    def get(self, request):
        overview = services.inventory_overview()
        overview["recent"] = LogisticsItemSerializer(
            LogisticsItem.objects.select_related("category", "location").order_by("-created_at")[
                :5
            ],
            many=True,
        ).data
        return Response(overview)


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------
@extend_schema_view(
    list=extend_schema(
        summary="List expenses",
        parameters=[
            OpenApiParameter("q", str, description="Search name, ID, reference or notes."),
            OpenApiParameter("year", int, description="Accounting year."),
            OpenApiParameter("month", int, description="Accounting month, 1-12."),
            OpenApiParameter("category", int, description="Category id."),
            OpenApiParameter("method", str, description="Payment method."),
            OpenApiParameter(
                "ordering",
                str,
                description="amount_minor, spent_on, created_at. Prefix with - to reverse.",
            ),
        ],
    )
)
class ExpenseViewSet(NoScopeMixin, ScopedModelViewSet):
    """Monthly operating costs. Filed by accounting month, not by payment date."""

    queryset = Expense.objects.select_related("category")
    lookup_field = "public_id"
    lookup_value_regex = "EXP-[0-9]+"

    ordering_fields = ["amount_minor", "spent_on", "created_at", "name"]

    required_permissions = {
        "list": "expense.view",
        "retrieve": "expense.view",
        "summary": "expense.view",
        "history": "expense.view",
        "printable": "expense.view",
        "create": "expense.manage",
        "update": "expense.manage",
        "partial_update": "expense.manage",
        "destroy": "expense.manage",
    }

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ExpenseWriteSerializer
        return ExpenseSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        search = (params.get("q") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(public_id__icontains=search)
                | Q(reference__icontains=search)
                | Q(notes__icontains=search)
            )

        year = _int_param(params, "year")
        if year is not None:
            queryset = queryset.filter(period_year=year)

        month = _int_param(params, "month")
        if month is not None:
            queryset = queryset.filter(period_month=month)

        category = _int_param(params, "category")
        if category is not None:
            queryset = queryset.filter(category_id=category)

        method = (params.get("method") or "").strip().upper()
        if method:
            queryset = queryset.filter(method=method)

        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)
        record(
            AuditAction.EXPENSE_CREATED,
            actor=self.request.user,
            obj=serializer.instance,
            new={
                "name": serializer.instance.name,
                "amount_minor": serializer.instance.amount_minor,
                "period": serializer.instance.period,
            },
        )
        logger.info(
            "Expense %s recorded by %s",
            serializer.instance.public_id,
            self.request.user.public_id,
        )

    def perform_update(self, serializer):
        before = snapshot(serializer.instance, EXPENSE_TRACKED)
        serializer.save(updated_by=self.request.user)
        old, new = diff(before, snapshot(serializer.instance, EXPENSE_TRACKED))
        if old or new:
            record(
                AuditAction.EXPENSE_UPDATED,
                actor=self.request.user,
                obj=serializer.instance,
                old=old,
                new=new,
            )

    def perform_destroy(self, instance):
        instance.delete(deleted_by=self.request.user)
        record(
            AuditAction.EXPENSE_DELETED,
            actor=self.request.user,
            obj=instance,
            old={"name": instance.name, "amount_minor": instance.amount_minor},
        )
        logger.info("Expense %s deleted by %s", instance.public_id, self.request.user.public_id)

    def _requested_period(self) -> tuple[int, int]:
        year, month = services.current_period()
        return (
            _int_param(self.request.query_params, "year", year) or year,
            _int_param(self.request.query_params, "month", month) or month,
        )

    @extend_schema(
        summary="Totals for one month, its year and the month before it",
        parameters=[OpenApiParameter("year", int), OpenApiParameter("month", int)],
        responses={200: ExpenseSummarySerializer},
    )
    @action(detail=False, methods=["get"], url_path="summary", pagination_class=None)
    def summary(self, request):
        year, month = self._requested_period()
        # Deliberately over every expense, not over the filtered list. A
        # "total for March" that changes when somebody types in the search box
        # is not a total, and this is the figure people copy into a report.
        return Response(services.expense_summary(year, month))

    @extend_schema(
        summary="Previous months and what each of them cost",
        parameters=[OpenApiParameter("year", int, description="Limit to one year.")],
        responses={200: ExpenseHistorySerializer},
    )
    @action(detail=False, methods=["get"], url_path="history", pagination_class=None)
    def history(self, request):
        year = _int_param(request.query_params, "year")
        return Response({"results": services.expense_history(year=year)})

    @extend_schema(
        summary="One month's expenses, unpaginated, for printing",
        parameters=[OpenApiParameter("year", int), OpenApiParameter("month", int)],
        responses={200: ExpensePrintSerializer},
    )
    @action(detail=False, methods=["get"], url_path="print", pagination_class=None)
    def printable(self, request):
        year, month = self._requested_period()
        expenses = self.get_queryset().filter(period_year=year, period_month=month)
        # Ascending by date on paper. A ledger anyone can follow down the page
        # runs the way the month ran, which is the opposite of a screen where
        # the newest row belongs at the top.
        expenses = expenses.order_by("spent_on", "created_at")[:PRINT_LIMIT]
        return Response(
            {
                "results": ExpenseSerializer(
                    expenses, many=True, context=self.get_serializer_context()
                ).data,
                "summary": services.expense_summary(year, month),
                "printed_at": timezone.now().isoformat(),
            }
        )
