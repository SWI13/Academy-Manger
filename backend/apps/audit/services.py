"""
Recording an action.

One entry point, called from the service layer rather than from viewsets, so
the same write is recorded whether it came from an HTTP request, a Celery
task, or a management command.

Recording must never break the thing it records. An audit failure is logged
loudly and swallowed: a payment that was approved has been approved, and
raising here would roll that back over a logging problem. The loud log is what
surfaces it - silent loss would be worse than either.
"""

import logging
from decimal import Decimal

from django.db import transaction

from .context import get_context
from .models import AuditLog

logger = logging.getLogger(__name__)

# Never copied into old_values/new_values, whatever a caller passes.
REDACTED_FIELDS = frozenset(
    {"password", "new_password", "current_password", "temporary_password", "token", "secret"}
)


def _serialisable(value):
    """JSONField cannot store a Decimal, a date, or a model instance."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "public_id"):
        return value.public_id
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _clean(values: dict | None) -> dict:
    if not values:
        return {}
    return {
        key: _serialisable(value) for key, value in values.items() if key not in REDACTED_FIELDS
    }


def _describe(obj) -> tuple[str, str, str]:
    if obj is None:
        return "", "", ""
    object_type = obj.__class__.__name__
    identifier = getattr(obj, "public_id", None) or getattr(obj, "pk", "")
    return object_type, str(identifier), str(obj)[:200]


def record(
    action: str,
    *,
    actor=None,
    obj=None,
    old: dict | None = None,
    new: dict | None = None,
    label: str | None = None,
) -> AuditLog | None:
    """
    Write one audit row, inside the caller's transaction.

    Deliberately not deferred to on_commit. The audit row belongs to the same
    transaction as the action it describes: if the action rolls back the row
    goes with it, and if the action commits the row is already there. An
    on_commit hook would create a window where the work is durable and the
    record of it is not.
    """
    object_type, object_id, described = _describe(obj)
    context = get_context()

    entry = AuditLog(
        actor_public_id=getattr(actor, "public_id", "") or "",
        actor_name=(actor.get_full_name() if hasattr(actor, "get_full_name") else "") or "",
        action=action,
        object_type=object_type,
        object_id=object_id,
        object_label=(label or described)[:200],
        old_values=_clean(old),
        new_values=_clean(new),
        ip_address=context.ip_address,
        user_agent=context.user_agent,
    )

    try:
        # A savepoint, so a failed audit insert rolls back only itself. Without
        # it, swallowing the error would leave the enclosing transaction broken
        # and every later query in the request would fail.
        with transaction.atomic():
            entry.save()
    except Exception:  # noqa: BLE001 - see module docstring
        logger.exception(
            "AUDIT WRITE FAILED action=%s actor=%s object=%s:%s",
            action,
            entry.actor_public_id,
            object_type,
            object_id,
        )
        return None

    return entry


def diff(before: dict, after: dict) -> tuple[dict, dict]:
    """
    Only what actually changed.

    Recording every field on every edit buries the one that moved, and an
    audit log nobody can read is an audit log nobody reads.
    """
    changed = {key for key in set(before) | set(after) if before.get(key) != after.get(key)}
    return (
        {key: before.get(key) for key in changed},
        {key: after.get(key) for key in changed},
    )


def snapshot(instance, fields: list[str]) -> dict:
    return {field: getattr(instance, field, None) for field in fields}
