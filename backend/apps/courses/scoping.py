"""
Who may reach which courses, enrolments and schedules.

One module, because these three questions have the same answer shape and
keeping them together is what stops them drifting apart. Every function
narrows a queryset; nothing here checks an object after fetching it, so a row
outside scope produces 404 rather than 403.
"""

from django.db.models import Q

from apps.rbac.services import has_permission

from .models import AssignmentStatus, CourseStatus


def taught_course_ids(user):
    """Course ids this user is actively assigned to teach."""
    from .models import CourseProfessor

    return CourseProfessor.objects.filter(
        professor=user, status=AssignmentStatus.ACTIVE
    ).values_list("course_id", flat=True)


def enrolled_course_ids(user):
    """Course ids this user has a live enrolment in."""
    from apps.enrollments.models import Enrollment

    return (
        Enrollment.objects.filter(student=user)
        .exclude(status__in=["CANCELLED", "DROPPED"])
        .values_list("course_id", flat=True)
    )


def scope_courses(queryset, user):
    if has_permission(user, "course.create"):
        return queryset  # owner, admin

    if has_permission(user, "enrollment.create"):
        # Reception enrols people, so it needs the catalogue - but not the
        # drafts an admin is still writing.
        return queryset.exclude(status=CourseStatus.DRAFT)

    # Professors see what they teach; students see what they are enrolled in.
    # A professor who is also a student sees both, which is why this is a
    # union rather than a branch.
    reachable = Q(pk__in=taught_course_ids(user)) | Q(pk__in=enrolled_course_ids(user))
    return queryset.filter(reachable).exclude(status=CourseStatus.DRAFT)


def scope_enrollments(queryset, user):
    if has_permission(user, "enrollment.create"):
        return queryset  # owner, admin, reception

    if has_permission(user, "score.enter"):
        # A professor sees the enrolments in their own courses, and nobody
        # else's. This is the roster.
        return queryset.filter(course_id__in=taught_course_ids(user))

    return queryset.filter(student=user)


def scope_schedules(queryset, user):
    if has_permission(user, "schedule.manage") or has_permission(user, "enrollment.create"):
        return queryset  # owner, admin, reception

    reachable = Q(course_id__in=taught_course_ids(user)) | Q(
        course_id__in=enrolled_course_ids(user)
    )
    # A slot explicitly assigned to this professor counts even if the course
    # assignment was ended - they still taught it.
    return queryset.filter(reachable | Q(professor=user))


def can_reach_course(user, course) -> bool:
    """For non-queryset checks, such as validating a write body."""
    return scope_courses(type(course).objects.filter(pk=course.pk), user).exists()
