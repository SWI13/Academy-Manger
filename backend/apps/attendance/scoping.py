"""
Who may reach which registers.

The same three-tier answer the rest of the platform gives, and it reuses the
course scoping rather than re-deriving it - a second definition of "the
courses this professor teaches" is a second definition that can drift.

The rule worth stating: a professor reaches the registers of courses they are
actively assigned to, and a student reaches their own rows and nobody else's.
A student may see that they were absent on Tuesday; they may not see who else
was.
"""

from apps.courses.scoping import enrolled_course_ids, taught_course_ids
from apps.rbac.services import has_permission


def scope_sessions(queryset, user):
    if has_permission(user, "course.create"):
        return queryset  # owner, admin

    if has_permission(user, "enrollment.create"):
        # Reception answers "was my child in on Tuesday", so it reads every
        # register. It cannot write one - that is `attendance.record`, which
        # reception does not hold.
        return queryset

    if has_permission(user, "attendance.record"):
        return queryset.filter(course_id__in=taught_course_ids(user))

    if has_permission(user, "attendance.view"):
        # Student: the registers of courses they are on. The rows inside are
        # narrowed separately - see `scope_records`.
        return queryset.filter(course_id__in=enrolled_course_ids(user))

    return queryset.none()


def scope_records(queryset, user):
    if has_permission(user, "course.create") or has_permission(user, "enrollment.create"):
        return queryset  # owner, admin, reception

    if has_permission(user, "attendance.record"):
        return queryset.filter(session__course_id__in=taught_course_ids(user))

    if has_permission(user, "attendance.view"):
        # Their own row, on their own registers. Filtered on the queryset, so
        # another student's record is 404 rather than 403 - a caller who can
        # tell "forbidden" from "absent" can enumerate the class.
        return queryset.filter(enrollment__student=user)

    return queryset.none()


def can_record_for_course(user, course) -> bool:
    """Whether this user may write the register for this course at all."""
    if has_permission(user, "course.create"):
        return True
    if not has_permission(user, "attendance.record"):
        return False
    return course.pk in set(taught_course_ids(user))
