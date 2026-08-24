"""
Gate 2: does this user hold the required permission at all?

Deny by default. A view that declares no requirement is closed, not open -
the failure mode of forgetting to declare one must be a locked door, because
the alternative failure mode is an endpoint nobody noticed was public.
"""

from rest_framework.permissions import BasePermission

from .services import has_permission


class RequirePermission(BasePermission):
    """
    Checks the codename a view declares for the current action.

    A view declares either:

        required_permission = "course.view"

    or, when actions differ:

        required_permissions = {
            "list": "course.view",
            "create": "course.create",
            "destroy": "course.archive",
        }

    Anything not covered is denied.
    """

    message = "Your role does not include this permission."

    def get_required_permission(self, request, view) -> str | None:
        per_action = getattr(view, "required_permissions", None)
        if per_action:
            action = getattr(view, "action", None)
            if action and action in per_action:
                return per_action[action]
            # An action the view did not map is not implicitly allowed.
            if action is not None:
                return None
        return getattr(view, "required_permission", None)

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated or not user.is_active:
            return False

        codename = self.get_required_permission(request, view)
        if codename is None:
            return False

        return has_permission(user, codename)


class IsAuthenticatedAndActive(BasePermission):
    """
    For endpoints every signed-in user may reach regardless of role - their own
    profile, their own notifications. Still refuses a deactivated account.
    """

    message = "Your account is not active."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_active)
