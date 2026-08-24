"""
Payment state transitions and balance arithmetic.

Every transition lives here rather than in a viewset, because the rules that
matter - separation of duty, terminal states, a reason on every rejection -
must hold no matter which entry point reaches them. A Celery task that
approves a payment has to obey the same rules as an HTTP request.
"""

import logging

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from .models import Payment, PaymentStatus

logger = logging.getLogger(__name__)


class TransitionError(Exception):
    """The payment cannot move from where it is to where it was asked to go."""


def _guard_terminal(payment: Payment, action: str) -> None:
    if payment.is_terminal:
        raise TransitionError(
            f"{payment.public_id} is already {payment.status} and cannot be {action}. "
            "Correct it with a new payment record instead."
        )


@transaction.atomic
def approve(payment: Payment, *, actor) -> Payment:
    """
    Confirm the money arrived.

    Refuses when the actor is the person who recorded it. Whoever takes the
    cash must not be the one who confirms it was taken - that single split is
    the difference between a payment log and an internal control, and it holds
    for admins and the owner too, not only reception.
    """
    locked = Payment.objects.select_for_update().get(pk=payment.pk)
    _guard_terminal(locked, "approved")

    if locked.created_by_id and locked.created_by_id == actor.pk:
        raise TransitionError(
            "You recorded this payment, so you cannot approve it. "
            "Ask another administrator to review it."
        )

    locked.status = PaymentStatus.APPROVED
    locked.approved_by = actor
    locked.approved_at = timezone.now()
    locked.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

    logger.info("Payment %s approved by %s", locked.public_id, actor.public_id)
    return locked


@transaction.atomic
def reject(payment: Payment, *, actor, reason: str) -> Payment:
    reason = (reason or "").strip()
    if not reason:
        raise TransitionError("A rejection needs a reason the payer can be told.")

    locked = Payment.objects.select_for_update().get(pk=payment.pk)
    _guard_terminal(locked, "rejected")

    locked.status = PaymentStatus.REJECTED
    locked.rejected_by = actor
    locked.rejected_at = timezone.now()
    locked.rejection_reason = reason
    locked.save(
        update_fields=["status", "rejected_by", "rejected_at", "rejection_reason", "updated_at"]
    )

    logger.info("Payment %s rejected by %s: %s", locked.public_id, actor.public_id, reason)
    return locked


@transaction.atomic
def cancel(payment: Payment, *, actor, reason: str = "") -> Payment:
    """
    Withdraw an entry made in error, before anyone approved it.

    Only from PENDING. An approved payment is a financial record; withdrawing
    it after the fact would be editing history rather than correcting it.
    """
    locked = Payment.objects.select_for_update().get(pk=payment.pk)
    _guard_terminal(locked, "cancelled")

    locked.status = PaymentStatus.CANCELLED
    locked.cancelled_by = actor
    locked.cancelled_at = timezone.now()
    if reason:
        locked.notes = f"{locked.notes}\nCancelled: {reason}".strip()
    locked.save(update_fields=["status", "cancelled_by", "cancelled_at", "notes", "updated_at"])

    logger.info("Payment %s cancelled by %s", locked.public_id, actor.public_id)
    return locked


def enrollment_balance(enrollment) -> dict:
    """
    What is owed, from the transactions - never from a stored counter.

        total     = the price agreed at enrolment
        paid      = approved payments
        pending   = recorded but not yet approved
        remaining = total - paid

    `pending` is reported separately and deliberately not subtracted. Money
    that has been claimed but not confirmed is not money received, and a
    balance that treats it as paid is how an institute discovers at term end
    that it is short.
    """
    totals = enrollment.payments.aggregate(
        paid=Sum("amount_minor", filter=Q(status=PaymentStatus.APPROVED)),
        pending=Sum("amount_minor", filter=Q(status=PaymentStatus.PENDING)),
    )
    paid = totals["paid"] or 0
    pending = totals["pending"] or 0
    total = enrollment.price_at_enrollment_minor

    return {
        "currency": enrollment.currency,
        "total_minor": total,
        "paid_minor": paid,
        "pending_minor": pending,
        "remaining_minor": total - paid,
        "is_settled": paid >= total,
    }
