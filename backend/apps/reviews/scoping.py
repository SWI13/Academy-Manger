"""
Who may read which reviews.

Three audiences, three different answers, and the professor's is the one that
needed thought.

A professor holds `review.view` scoped to their own courses. But a review is
written by a student who is often still in the room, and whose marks that same
professor enters. A professor who can see that STU-000042 rated them 2/5 has
been handed a motive, and the student knows it - which is how you get a
feedback channel that only ever returns fives. So professors read reviews of
their courses with the author's identity withheld (see serializers), and only
after moderation.

Everyone else sees what you would expect: staff who moderate see everything,
including pending; a student sees the approved reviews on courses they are in,
plus their own review whatever state it is in.
"""

from django.db.models import Q

from apps.courses.scoping import enrolled_course_ids, taught_course_ids
from apps.rbac.services import has_permission

from .models import ReviewStatus


def scope_reviews(queryset, user):
    if has_permission(user, "review.moderate"):
        # Owner and admin. Moderation is impossible without seeing what is
        # waiting to be moderated.
        return queryset

    if not has_permission(user, "review.view"):
        return queryset.none()

    if has_permission(user, "score.enter"):
        # Professor: their own courses, approved only. Nothing pending, so
        # they cannot see a complaint before a moderator has.
        return queryset.filter(
            enrollment__course_id__in=taught_course_ids(user), status=ReviewStatus.APPROVED
        )

    # Student: what is published on the courses they are in, and their own
    # review in any state - otherwise they could not see that it was rejected.
    return queryset.filter(
        Q(enrollment__student=user)
        | Q(
            enrollment__course_id__in=enrolled_course_ids(user),
            status=ReviewStatus.APPROVED,
        )
    )


def hides_author_from(user) -> bool:
    """
    True when this caller must not learn who wrote a review.

    A professor, unless they also moderate. Checked in the serializer rather
    than by stripping the field afterwards, so the identity is never put into
    a response object in the first place.
    """
    return has_permission(user, "score.enter") and not has_permission(user, "review.moderate")
