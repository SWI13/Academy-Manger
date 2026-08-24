"""
Review serializers.

The read serializer decides one thing carefully: whether the author's name
goes into the response at all. For a professor it does not - see scoping. The
field is omitted rather than blanked, because a key that is present and empty
is a key some frontend will eventually try to fill from somewhere else.
"""

from rest_framework import serializers

from apps.enrollments.models import Enrollment

from .models import MAX_RATING, MIN_RATING, Review, ReviewStatus
from .scoping import hides_author_from


class ReviewSerializer(serializers.ModelSerializer):
    course_public_id = serializers.CharField(source="enrollment.course.public_id", read_only=True)
    course_title = serializers.CharField(source="enrollment.course.title", read_only=True)
    student_public_id = serializers.CharField(source="enrollment.student.public_id", read_only=True)
    student_name = serializers.CharField(source="enrollment.student.get_full_name", read_only=True)
    moderated_by_public_id = serializers.CharField(
        source="moderated_by.public_id", read_only=True, default=None
    )

    class Meta:
        model = Review
        fields = [
            "id",
            "enrollment",
            "course_public_id",
            "course_title",
            "student_public_id",
            "student_name",
            "rating",
            "comment",
            "status",
            "admin_response",
            "moderated_by_public_id",
            "moderated_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request and hides_author_from(request.user):
            data.pop("student_public_id", None)
            data.pop("student_name", None)
        return data


class ReviewCreateSerializer(serializers.Serializer):
    """
    Writing one.

    `status` is absent by design. A review is created PENDING and only a
    moderator moves it, so nobody publishes straight past moderation.
    """

    enrollment_id = serializers.IntegerField()
    rating = serializers.IntegerField(min_value=MIN_RATING, max_value=MAX_RATING)
    comment = serializers.CharField(allow_blank=True, required=False, max_length=4000)

    def create(self, validated_data):
        return Review.objects.create(
            enrollment=validated_data["enrollment"],
            rating=validated_data["rating"],
            comment=validated_data.get("comment", ""),
            status=ReviewStatus.PENDING,
        )


class ReviewUpdateSerializer(serializers.Serializer):
    """Correcting your own words, before anyone has ruled on them."""

    rating = serializers.IntegerField(min_value=MIN_RATING, max_value=MAX_RATING, required=False)
    comment = serializers.CharField(allow_blank=True, required=False, max_length=4000)


class ModerationSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[ReviewStatus.APPROVED, ReviewStatus.HIDDEN, ReviewStatus.REJECTED]
    )
    admin_response = serializers.CharField(allow_blank=True, required=False, max_length=2000)


class CourseRatingSerializer(serializers.Serializer):
    """The public summary for one course. Approved reviews only."""

    course_public_id = serializers.CharField()
    course_title = serializers.CharField()
    review_count = serializers.IntegerField()
    average_rating = serializers.FloatField(allow_null=True)
    distribution = serializers.DictField(child=serializers.IntegerField())


def resolve_enrollment(enrollment_id: int) -> Enrollment:
    try:
        return Enrollment.objects.select_related("course", "student").get(pk=enrollment_id)
    except Enrollment.DoesNotExist as exc:
        raise serializers.ValidationError({"enrollment_id": "No such enrolment."}) from exc
