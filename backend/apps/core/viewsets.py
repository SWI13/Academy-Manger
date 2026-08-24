"""
Gate 3: which rows may this user reach?

Gate 2 (rbac.permissions.RequirePermission) answers "may this user enter marks
at all". This answers "may they enter *this* student's mark". Both are
required, and the second is the one that is easy to forget - forgetting it is
how one student reads another's payment history by changing a number in a URL.

The scope is applied in get_queryset(), not checked after fetching an object,
and that choice is what produces the right status code. A row outside the
caller's queryset is simply not found, so DRF raises 404. Returning 403 would
confirm the row exists, and an attacker who can distinguish "forbidden" from
"absent" can enumerate the table.

    GET /api/v1/payments/91/   ->  403   "there is a payment 91, not for you"
    GET /api/v1/payments/91/   ->  404   tells them nothing
"""

from rest_framework import viewsets

from apps.rbac.permissions import RequirePermission


class ScopedQuerysetMixin:
    """
    Narrows every queryset to what the caller may reach.

    Subclasses implement `scope_queryset`. The base refuses to guess: a
    subclass that does not implement it raises rather than quietly returning
    everything, because a silent full queryset is the bug this class exists to
    prevent.
    """

    def scope_queryset(self, queryset, user):
        raise NotImplementedError(
            f"{self.__class__.__name__} must implement scope_queryset(queryset, user). "
            "If this resource genuinely has no per-user scope, say so explicitly "
            "by returning the queryset unchanged with a comment explaining why."
        )

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not user or not user.is_authenticated:
            return queryset.none()
        return self.scope_queryset(queryset, user)


class ScopedModelViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    """
    The base every resource viewset should inherit.

    Both gates are wired in by default:

        class PaymentViewSet(ScopedModelViewSet):
            queryset = Payment.objects.all()
            required_permissions = {
                "list": "payment.view",
                "retrieve": "payment.view",
                "create": "payment.create",
            }

            def scope_queryset(self, queryset, user):
                if has_permission(user, "payment.view_all"):
                    return queryset
                return queryset.filter(enrollment__student__user=user)
    """

    permission_classes = [RequirePermission]


class ScopedReadOnlyModelViewSet(ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    """Same two gates, for resources nobody writes through the API."""

    permission_classes = [RequirePermission]
