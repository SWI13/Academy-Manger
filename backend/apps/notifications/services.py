"""
Sending a notification.

One entry point, called from the service layer. Every send is best-effort: a
notification that cannot be created must not unwind the action that triggered
it. A payment was still approved even if nobody could be told.
"""

import logging

from django.db import transaction

from .channels import get_channel
from .models import Channel, Notification

logger = logging.getLogger(__name__)


def notify(
    recipient,
    kind: str,
    title: str,
    message: str,
    *,
    target=None,
    link_path: str = "",
    channel: str = Channel.IN_APP,
) -> Notification | None:
    """Create and deliver one notification. Returns None if it could not be sent."""
    if recipient is None or not getattr(recipient, "is_active", False):
        # No point queueing for a closed account; it would never be read.
        return None

    target_type, target_id = "", ""
    if target is not None:
        target_type = target.__class__.__name__
        target_id = str(getattr(target, "public_id", None) or target.pk)

    try:
        with transaction.atomic():
            notification = Notification.objects.create(
                recipient=recipient,
                kind=kind,
                title=title[:150],
                message=message,
                channel=channel,
                target_type=target_type,
                target_id=target_id,
                link_path=link_path[:200],
            )
    except Exception:  # noqa: BLE001 - see module docstring
        logger.exception("Could not create %s notification for %s", kind, recipient)
        return None

    get_channel(channel).deliver(notification)
    return notification


def notify_many(recipients, kind: str, title: str, message: str, **kwargs) -> int:
    """Fan out to several people. One failure does not stop the rest."""
    sent = 0
    for recipient in recipients:
        if notify(recipient, kind, title, message, **kwargs):
            sent += 1
    return sent


def unread_count(user) -> int:
    return Notification.objects.filter(recipient=user, is_read=False).count()
