"""Enrollment serializers."""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.core.enums import RoleCode
from apps.courses.models import Course

from .models import Enrollment, EnrollmentStatus

User = get_user_model()


class StudentBriefSerializer(serializers.ModelSerializer):
    """
    The roster row a professor sees: who is in the room, and what they need
    to know about them. Nothing financial.
    """

    full_name = serializers.CharField(source="get_full_name", read_only=True)
    age = serializers.SerializerMethodField()
    wilaya = serializers.SerializerMethodField()
    prior_level = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["public_id", "full_name", "phone", "age", "wilaya", "prior_level"]

    def get_age(self, user) -> int | None:
        profile = getattr(user, "student_profile", None)
        return profile.age if profile else None

    def get_wilaya(self, user) -> str:
        profile = getattr(user, "student_profile", None)
        return profile.get_wilaya_display() if profile and profile.wilaya else ""

    def get_prior_level(self, user) -> str:
        profile = getattr(user, "student_profile", None)
        return profile.prior_level if profile else ""


class EnrollmentSerializer(serializers.ModelSerializer):
    student = StudentBriefSerializer(read_only=True)
    course_public_id = serializers.CharField(source="course.public_id", read_only=True)
    course_title = serializers.CharField(source="course.title", read_only=True)

    class Meta:
        model = Enrollment
        fields = [
            "id",
            "student",
            "course_public_id",
            "course_title",
            "enrolled_at",
            "status",
            "price_at_enrollment_minor",
            "currency",
            "notes",
        ]
        read_only_fields = fields


class EnrollmentCreateSerializer(serializers.Serializer):
    student_public_id = serializers.CharField()
    course_public_id = serializers.CharField()
    notes = serializers.CharField(required=False, allow_blank=True)
    # Deliberately absent: price. It is copied from the course, never sent by
    # the client - a client-supplied price is a discount anyone can grant.

    def validate_student_public_id(self, value):
        try:
            student = User.objects.get(public_id__iexact=value.strip())
        except User.DoesNotExist:
            raise serializers.ValidationError("No user with that ID.") from None
        if not student.user_roles.filter(
            role__code=RoleCode.STUDENT, revoked_at__isnull=True
        ).exists():
            raise serializers.ValidationError("That user is not a student.")
        if not student.is_active:
            raise serializers.ValidationError("That student's account is not active.")
        self.student = student
        return value

    def validate_course_public_id(self, value):
        try:
            course = Course.objects.get(public_id__iexact=value.strip())
        except Course.DoesNotExist:
            raise serializers.ValidationError("No course with that ID.") from None
        if not course.is_open_for_enrollment:
            raise serializers.ValidationError(
                f"That course is {course.status} and is not accepting enrolments."
            )
        self.course = course
        return value

    def validate(self, attrs):
        student, course = self.student, self.course

        already = Enrollment.objects.filter(student=student, course=course).exclude(
            status__in=[EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED]
        )
        if already.exists():
            raise serializers.ValidationError(
                {"student_public_id": "That student is already enrolled in this course."}
            )

        if course.capacity is not None and course.seats_remaining <= 0:
            raise serializers.ValidationError(
                {"course_public_id": f"{course.public_id} is full ({course.capacity} seats)."}
            )

        return attrs

    def create(self, validated):
        return Enrollment.objects.create(
            student=self.student,
            course=self.course,
            # Frozen here. The catalogue price may move tomorrow; what this
            # student agreed to pay must not.
            price_at_enrollment_minor=self.course.price_minor,
            currency=self.course.currency,
            notes=validated.get("notes", ""),
            created_by=self.context["request"].user,
        )

    def to_representation(self, instance):
        return EnrollmentSerializer(instance, context=self.context).data


class EnrollmentStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=EnrollmentStatus.choices)
    reason = serializers.CharField(required=False, allow_blank=True)
