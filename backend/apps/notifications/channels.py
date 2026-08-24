"""
Delivery channels.

The abstraction exists now so that adding SMS later is a class, not a
refactor - see architecture D-8. Only the in-app channel is registered in the
MVP; the SMS one is sketched to make the shape concrete and is deliberately
not wired up.

A channel never raises. Delivery failing is a fact to record on the
notification, not an exception that unwinds whatever caused it - a payment
approval must not roll back because a text message bounced.
"""

import logging
from abc import ABC, abstractmethod

from django.utils import timezone

from .models import Channel, DeliveryStatus

logger = logging.getLogger(__name__)


class NotificationChannel(ABC):
    code: str

    @abstractmethod
    def send(self, notification) -> tuple[bool, str]:
        """Return (delivered, failure_reason)."""

    def deliver(self, notification) -> None:
        try:
            delivered, reason = self.send(notification)
        except Exception as exc:  # noqa: BLE001 - see module docstring
            logger.exception("Channel %s raised for notification %s", self.code, notification.pk)
            delivered, reason = False, str(exc)[:300]

        notification.delivery_status = (
            DeliveryStatus.DELIVERED if delivered else DeliveryStatus.FAILED
        )
        notification.delivered_at = timezone.now() if delivered else None
        notification.failure_reason = "" if delivered else reason
        notification.save(
            update_fields=["delivery_status", "delivered_at", "failure_reason", "updated_at"]
        )


class InAppChannel(NotificationChannel):
    """
    The row is the delivery. Writing it is what makes it visible, so this
    always succeeds - but it still goes through the same path so the delivery
    fields mean the same thing for every channel.
    """

    code = Channel.IN_APP

    def send(self, notification) -> tuple[bool, str]:
        return True, ""


class SmsChannel(NotificationChannel):
    """
    Not registered. Planned for students and professors (D-8).

    What is still missing when it is turned on: a provider, credentials, cost
    controls, opt-out handling, and delivery-receipt reconciliation. Those
    arrive with the feature - the point of this stub is that none of them
    require changing the model or the dispatch path.
    """

    code = Channel.SMS

    def send(self, notification) -> tuple[bool, str]:
        raise NotImplementedError("SMS delivery is not enabled. See architecture D-8.")


_REGISTRY: dict[str, NotificationChannel] = {Channel.IN_APP: InAppChannel()}


def get_channel(code: str) -> NotificationChannel:
    try:
        return _REGISTRY[code]
    except KeyError:
        raise ValueError(f"No delivery channel registered for {code!r}.") from None


def enabled_channels() -> list[str]:
    return sorted(_REGISTRY)
