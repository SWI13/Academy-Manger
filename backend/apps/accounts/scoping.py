"""
Who may see which users.

Kept in one module rather than inlined in a viewset, because "which rows may
this role reach" is the single most security-critical question in the platform
and it should be readable in one place, not reconstructed from four viewsets.

Professor scope widens in Phase 4-6: once CourseProfessor and Enrollment
exist, a professor sees the students enrolled in their courses. Until those
tables exist there is nothing to widen to, so a professor sees only
themselves - which is the safe direction to be wrong in.
"""

from django.db.models import Q

from apps.rbac.services import has_permission


def scope_users(queryset, user):
    """
    Narrow a User queryset to what `user` may reach.

    Rows outside the result are not merely hidden - they are absent, so DRF
    raises 404 rather than 403 and the caller cannot tell a forbidden record
    from one that does not exist.
    """
    # user.deactivate is held only by owner and admin, and is a fair proxy for
    # "manages people". Reception is handled below: it needs to find students
    # to enrol them, but has no business reading admin or owner accounts.
    if has_permission(user, "user.deactivate"):
        return queryset

    if has_permission(user, "user.create"):
        # Reception. Sees the people it serves and the staff it works beside,
        # never the accounts that could be used to escalate.
        return queryset.filter(
            Q(primary_role__in=["STUDENT", "PROFESSOR"]) | Q(pk=user.pk)
        )

    # Professors and students: themselves only, for now.
    return queryset.filter(pk=user.pk)


def can_manage_role(actor, target_role: str) -> bool:
    """
    Whether `actor` may create or edit a user holding `target_role`.

    Reception creating an admin account would be privilege escalation with
    extra steps, so the role a caller may hand out is bounded by their own.
    """
    if has_permission(actor, "user.assign_role"):
        return True  # owner
    if has_permission(actor, "user.deactivate"):
        return target_role in ("STUDENT", "PROFESSOR", "RECEPTION")  # admin
    if has_permission(actor, "user.create"):
        return target_role in ("STUDENT", "PROFESSOR")  # reception
    return False
