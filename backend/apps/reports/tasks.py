"""
Running an export in the background.

The security-critical line in this file is that the task re-resolves the
requesting user and runs the query *as them*. It does not receive rows from
the web process, and it does not trust the filters to have been narrowed
already. Two reasons: a job may sit in the queue while the person who asked
for it is deactivated or has a role revoked, and a queue message is not a
place to put an authorization decision.

A user who is no longer active gets no file. The job fails with a reason
rather than quietly producing one.
"""

import logging
import uuid

from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.core import storage
from apps.rbac.services import has_permission

from .csvfiles import to_csv
from .models import ExportStatus, ReportExport
from .queries import REPORT_PERMISSIONS, run

logger = logging.getLogger(__name__)
User = get_user_model()


def build_export_key(export: ReportExport) -> str:
    return f"exports/{export.report_name}/{export.public_id}/{uuid.uuid4().hex}.csv"


def _fail(export: ReportExport, reason: str) -> dict:
    export.status = ExportStatus.FAILED
    export.error = reason[:300]
    export.finished_at = timezone.now()
    export.save(update_fields=["status", "error", "finished_at", "updated_at"])
    logger.warning("Export %s failed: %s", export.public_id, reason)
    return {"export": str(export.public_id), "status": export.status, "error": reason}


@shared_task(name="reports.run_export")
def run_export(export_id: int) -> dict:
    try:
        export = ReportExport.objects.select_related("requested_by").get(pk=export_id)
    except ReportExport.DoesNotExist:
        # Nothing to fail against. Logged rather than retried - the row is not
        # coming back.
        logger.error("Export %s no longer exists", export_id)
        return {"export": None, "status": "missing"}

    if export.status != ExportStatus.PENDING:
        # Beat and acks-late both mean a task can arrive twice. Producing the
        # file a second time would leave an orphaned object in the bucket.
        return {"export": str(export.public_id), "status": export.status, "skipped": True}

    export.status = ExportStatus.RUNNING
    export.started_at = timezone.now()
    export.save(update_fields=["status", "started_at", "updated_at"])

    user = export.requested_by
    if not user.is_active:
        return _fail(export, "The person who requested this export is no longer active.")

    # Re-checked here, not only at request time. The gap between queueing and
    # running is exactly when a role gets revoked.
    needed = REPORT_PERMISSIONS.get(export.report_name)
    if needed is None:
        return _fail(export, f"No report named {export.report_name!r}.")
    if not has_permission(user, needed) or not has_permission(user, "report.export"):
        return _fail(export, "The requester no longer holds the permissions for this report.")

    try:
        result = run(export.report_name, user, export.filters)
        payload = to_csv(result["rows"])
        key = build_export_key(export)
        size = storage.put_bytes(key, payload, "text/csv")
    except storage.StorageError as exc:
        return _fail(export, str(exc))
    except Exception as exc:  # noqa: BLE001 - the row must carry the failure
        logger.exception("Export %s blew up", export.public_id)
        return _fail(export, f"{exc.__class__.__name__}: {exc}")

    export.status = ExportStatus.READY
    export.storage_key = key
    export.row_count = len(result["rows"])
    export.size_bytes = size
    export.finished_at = timezone.now()
    export.save(
        update_fields=[
            "status",
            "storage_key",
            "row_count",
            "size_bytes",
            "finished_at",
            "updated_at",
        ]
    )

    record(
        AuditAction.REPORT_EXPORTED,
        actor=user,
        obj=export,
        new={
            "report": export.report_name,
            "rows": export.row_count,
            "filters": export.filters,
        },
        label=f"{export.report_name} export",
    )
    logger.info(
        "Export %s ready: %s rows for %s", export.public_id, export.row_count, user.public_id
    )
    return {"export": str(export.public_id), "status": export.status, "rows": export.row_count}
