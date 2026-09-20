"""The dashboard, the three reports, the two printable summaries, and export jobs."""

import logging
from datetime import date

from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status as http_status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.core import storage
from apps.core.viewsets import ScopedReadOnlyModelViewSet
from apps.rbac.permissions import IsAuthenticatedAndActive, RequirePermission
from apps.rbac.services import has_permission

from . import management_reports
from .dashboards import build_dashboard
from .models import ReportExport
from .queries import REPORT_PERMISSIONS, parse_date, run
from .serializers import (
    ExportRequestSerializer,
    FinancialSummarySerializer,
    ManagementReportSerializer,
    ReportExportSerializer,
    ReportResultSerializer,
)
from .tasks import run_export

logger = logging.getLogger(__name__)

FILTER_PARAMETERS = [
    OpenApiParameter("from", str, description="Period start (YYYY-MM-DD)."),
    OpenApiParameter("to", str, description="Period end (YYYY-MM-DD)."),
    OpenApiParameter("course", str, description="Course public ID."),
    OpenApiParameter("unpaid_only", bool, description="Outstanding report: hide settled rows."),
]


@extend_schema(
    summary="Dashboard for the signed-in user",
    responses={200: None},
    description=(
        "Returns only the tiles the caller's permissions allow. A figure this "
        "endpoint never sends cannot leak through a new screen or the browser's "
        "network tab."
    ),
)
class DashboardView(APIView):
    # No permission codename: every signed-in user has a dashboard. What
    # differs is what it contains, and that is decided tile by tile.
    permission_classes = [IsAuthenticatedAndActive]

    def get(self, request):
        return Response(build_dashboard(request.user))


class ReportPermissionMixin:
    """
    The permission depends on which report was asked for.

    `RequirePermission` reads `required_permission` off the view, so this
    resolves it from the URL. An unrecognised name yields None, which the
    permission class treats as denied - the deny-by-default rule holding even
    for a route that should not exist. The URL regex already restricts the
    name to the known set, so in practice this is the second lock.
    """

    permission_classes = [RequirePermission]

    @property
    def required_permission(self):
        return REPORT_PERMISSIONS.get(self.kwargs.get("name"))


@extend_schema(
    summary="Run a report",
    parameters=FILTER_PARAMETERS,
    responses={200: ReportResultSerializer},
    description=(
        "revenue and outstanding need report.view_financial; enrollments needs "
        "report.view_operational. Every row is scoped to the caller by the same "
        "helpers the rest of the API uses, so a professor's enrolment report "
        "covers their own courses and nobody else's."
    ),
)
class ReportView(ReportPermissionMixin, APIView):
    def get(self, request, name):
        filters = {
            key: value
            for key, value in request.query_params.items()
            if key in {"from", "to", "course", "unpaid_only"}
        }
        if "unpaid_only" in filters:
            filters["unpaid_only"] = filters["unpaid_only"].lower() in {"1", "true", "yes"}

        result = run(name, request.user, filters)
        return Response(ReportResultSerializer(result).data)


@extend_schema(
    summary="Queue a CSV export",
    request=ExportRequestSerializer,
    responses={202: ReportExportSerializer},
    description=(
        "Returns a job immediately; poll it, then fetch the signed download "
        "URL. The worker re-checks the requester's permissions and re-runs the "
        "query as them, so a role revoked while the job waits produces no file."
    ),
)
class ReportExportView(ReportPermissionMixin, APIView):
    def post(self, request, name):
        # Both gates: the report's own permission comes from the mixin, and
        # export is a separate grant on top. Reception may read operational
        # numbers on screen without being able to walk out with the file.
        if not has_permission(request.user, "report.export"):
            raise PermissionDenied("Your role does not include exporting reports.")

        serializer = ExportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        export = ReportExport.objects.create(
            report_name=name,
            filters=serializer.validated_data.get("filters") or {},
            requested_by=request.user,
        )
        # After commit: the worker can pick the job up the instant it is
        # queued, and a task that arrives before its row is visible fails
        # looking for a row that exists.
        transaction.on_commit(lambda: run_export.delay(export.pk))

        logger.info("Export %s queued by %s", export.public_id, request.user.public_id)
        return Response(ReportExportSerializer(export).data, status=http_status.HTTP_202_ACCEPTED)


@extend_schema_view(
    list=extend_schema(summary="Your export jobs"),
    retrieve=extend_schema(summary="One export job"),
)
class ReportExportViewSet(ScopedReadOnlyModelViewSet):
    """
    Your own exports, and nobody else's - including the owner's.

    An export is a file somebody asked for, and who asked is part of what the
    audit log is for. Sharing them across staff would turn one person's
    permission to export into everyone's permission to read the result.
    """

    queryset = ReportExport.objects.select_related("requested_by")
    serializer_class = ReportExportSerializer
    lookup_field = "public_id"

    required_permissions = {
        "list": "report.export",
        "retrieve": "report.export",
    }

    def scope_queryset(self, queryset, user):
        return queryset.filter(requested_by=user)


@extend_schema(
    summary="Download a finished export",
    responses={200: None},
    description="A short-lived signed URL. The bucket is private; this is the only route.",
)
class ExportDownloadView(APIView):
    permission_classes = [RequirePermission]
    required_permission = "report.export"

    def get(self, request, public_id):
        export = get_object_or_404(
            ReportExport.objects.select_related("requested_by"),
            public_id=public_id,
            # Scoped in the lookup, so somebody else's export is 404 rather
            # than 403 and its existence stays unconfirmed.
            requested_by=request.user,
        )

        if not export.is_ready:
            return Response(
                {
                    "error": {
                        "code": "export_not_ready",
                        "message": "This export is not finished.",
                        "details": {"status": export.status, "error": export.error},
                    }
                },
                status=http_status.HTTP_409_CONFLICT,
            )

        filename = f"{export.report_name}-{export.created_at:%Y%m%d}.csv"
        try:
            url = storage.presign_download(export.storage_key, filename=filename)
        except storage.StorageError as exc:
            return Response(
                {"error": {"code": "storage_unavailable", "message": str(exc), "details": {}}},
                status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        record(
            AuditAction.EXPORT_DOWNLOADED,
            actor=request.user,
            obj=export,
            new={"report": export.report_name, "rows": export.row_count},
            label=f"{export.report_name} export",
        )
        return Response({"url": url, "expires_in": storage.settings.S3_DOWNLOAD_URL_TTL})


class FinancialSummaryView(APIView):
    """
    Income against expenditure, over any date range.

    Behind `report.view_financial`, which reception and professors do not
    hold - the same line the revenue report draws. Printing must never be a
    way around a permission, so this is the one gate and there is no second
    path to the same numbers.
    """

    permission_classes = [RequirePermission]
    required_permission = "report.view_financial"

    @extend_schema(
        summary="Income, expenditure and the net figure",
        parameters=[
            OpenApiParameter("from", str, description="On or after (ISO date)."),
            OpenApiParameter("to", str, description="On or before (ISO date)."),
        ],
        responses={200: FinancialSummarySerializer},
    )
    def get(self, request):
        return Response(
            management_reports.financial_summary(
                start=parse_date(request.query_params.get("from")),
                end=parse_date(request.query_params.get("to")),
            )
        )


class ManagementReportView(APIView):
    """
    One month of the institute on one sheet - "August 2026 Management Report".

    `report.view_financial` rather than `report.view_operational`, because the
    sheet carries income, expenditure and what is outstanding. An operational
    reader gets the dashboard, which is assembled tile by tile from the
    permissions they actually hold.
    """

    permission_classes = [RequirePermission]
    required_permission = "report.view_financial"

    @extend_schema(
        summary="The month's management report",
        parameters=[
            OpenApiParameter("year", int, description="Defaults to this year."),
            OpenApiParameter("month", int, description="1-12. Defaults to this month."),
        ],
        responses={200: ManagementReportSerializer},
    )
    def get(self, request):
        today = date.today()
        year = _int_param(request.query_params, "year", today.year)
        month = _int_param(request.query_params, "month", today.month)
        if not 1 <= month <= 12:
            month = today.month
        return Response(management_reports.management_report(year=year, month=month))


def _int_param(params, key: str, default: int) -> int:
    raw = (params.get(key) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default
