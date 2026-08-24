"""
Who may reach which assessments and marks.

Two rules that are easy to get subtly wrong:

A professor reaches assessments and marks for courses they are actively
assigned to - a who, not a when. There is no deadline (D-7).

A student sees their own marks, and only for assessments that have been
published. Unpublished marks exist; they are simply not the student's to see
yet, and the filter is on the queryset so an unpublished mark returns 404
rather than 403.
"""

from apps.courses.scoping import taught_course_ids
from apps.rbac.services import has_permission


def scope_assessments(queryset, user):
    if has_permission(user, "course.create"):
        return queryset  # owner, admin

    if has_permission(user, "score.enter"):
        return queryset.filter(course_id__in=taught_course_ids(user))

    if has_permission(user, "assessment.view"):
        # Student: only their own courses, and only what has been published.
        from apps.courses.scoping import enrolled_course_ids

        return queryset.filter(course_id__in=enrolled_course_ids(user), is_published=True)

    return queryset.none()


def scope_scores(queryset, user):
    if has_permission(user, "course.create"):
        return queryset  # owner, admin

    if has_permission(user, "score.enter"):
        return queryset.filter(assessment__course_id__in=taught_course_ids(user))

    if has_permission(user, "score.view"):
        return queryset.filter(enrollment__student=user, assessment__is_published=True)

    return queryset.none()


def can_mark_course(user, course) -> bool:
    """Whether this user may enter marks for this course at all."""
    if has_permission(user, "course.create"):
        return True
    if not has_permission(user, "score.enter"):
        return False
    return course.pk in set(taught_course_ids(user))
