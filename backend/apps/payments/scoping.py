"""
Who may see which payments and proofs.

A student's payment history is among the most sensitive data here - it says
what a family can afford. The scope is applied in the queryset so an
out-of-scope payment returns 404 rather than 403; payment IDs are sequential,
and a 403 on PAY-000091 tells an attacker exactly how many payments exist.

Professors hold no payment permission at all, so they never reach this code -
but the queryset still ends in a `none()` rather than a fall-through, because
a future role with a partial grant must not inherit "everything" by accident.
"""

from apps.rbac.services import has_permission


def scope_payments(queryset, user):
    if has_permission(user, "payment.create"):
        # Owner, admin, reception. Reception records and chases money, so it
        # needs the full ledger.
        return queryset

    if has_permission(user, "payment.view"):
        # Student: their own history and nobody else's.
        return queryset.filter(enrollment__student=user)

    return queryset.none()


def scope_proofs(queryset, user):
    if has_permission(user, "payment.create"):
        return queryset

    if has_permission(user, "proof.view"):
        return queryset.filter(payment__enrollment__student=user)

    return queryset.none()
