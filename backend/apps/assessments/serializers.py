"""Assessment and mark-sheet serializers."""

from decimal import Decimal

from rest_framework import serializers

from apps.courses.models import Course
from apps.enrollments.models import Enrollment, EnrollmentStatus

from .models import Assessment, AssessmentKind, AssessmentScore
from .scoping import can_mark_course


class AssessmentSerializer(serializers.ModelSerializer):
    course_public_id = serializers.CharField(source="course.public_id", read_only=True)
    course_title = serializers.CharField(source="course.title", read_only=True)
    marked_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Assessment
        fields = [
            "id",
            "course_public_id",
            "course_title",
            "title",
            "kind",
            "max_score",
            "weight",
            "held_on",
            "is_published",
            "published_at",
            "marked_count",
            "created_at",
        ]
        read_only_fields = ["id", "is_published", "published_at", "created_at"]


class AssessmentWriteSerializer(serializers.ModelSerializer):
    course_public_id = serializers.CharField(write_only=True)

    class Meta:
        model = Assessment
        fields = ["course_public_id", "title", "kind", "max_score", "weight", "held_on"]

    def validate_course_public_id(self, value):
        try:
            course = Course.objects.get(public_id__iexact=value.strip())
        except Course.DoesNotExist:
            raise serializers.ValidationError("No course with that ID.") from None

        if not can_mark_course(self.context["request"].user, course):
            # A professor creating an assessment on someone else's course
            # would then hold the mark sheet for that class.
            raise serializers.ValidationError("You are not assigned to that course.")

        self.course = course
        return value

    def validate_max_score(self, value):
        if value <= 0:
            raise serializers.ValidationError("The maximum score must be greater than zero.")
        return value

    def create(self, validated):
        validated.pop("course_public_id", None)
        return Assessment.objects.create(
            course=self.course, created_by=self.context["request"].user, **validated
        )

    def to_representation(self, instance):
        return AssessmentSerializer(instance, context=self.context).data


class ScoreSerializer(serializers.ModelSerializer):
    student_public_id = serializers.CharField(source="enrollment.student.public_id", read_only=True)
    student_name = serializers.CharField(source="enrollment.student.get_full_name", read_only=True)
    max_score = serializers.DecimalField(
        source="assessment.max_score", max_digits=6, decimal_places=2, read_only=True
    )
    percentage = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)
    was_edited = serializers.BooleanField(read_only=True)
    last_changed_by_public_id = serializers.CharField(
        source="last_changed_by.public_id", read_only=True, default=None
    )

    class Meta:
        model = AssessmentScore
        fields = [
            "id",
            "student_public_id",
            "student_name",
            "score",
            "max_score",
            "percentage",
            "comment",
            "entered_at",
            # Surfaced on the row, not buried in the audit log: marks never
            # lock, so an edit long after the fact has to be visible here.
            "was_edited",
            "change_count",
            "last_changed_at",
            "last_changed_by_public_id",
        ]
        read_only_fields = fields


class MarkSheetRowSerializer(serializers.Serializer):
    student_public_id = serializers.CharField()
    score = serializers.DecimalField(max_digits=6, decimal_places=2)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=500)


class MarkSheetSerializer(serializers.Serializer):
    """
    The whole sheet, in one request.

    Validated as a unit: if one row names a student who is not in the class,
    or a score above the maximum, nothing is written. A partially accepted
    mark sheet is worse than a rejected one, because nobody knows which half
    landed.
    """

    rows = MarkSheetRowSerializer(many=True)

    def validate_rows(self, rows):
        if not rows:
            raise serializers.ValidationError("Send at least one mark.")

        assessment = self.context["assessment"]

        seen = set()
        for row in rows:
            public_id = row["student_public_id"].strip()
            if public_id.upper() in seen:
                raise serializers.ValidationError(f"{public_id} appears twice in the same sheet.")
            seen.add(public_id.upper())

        enrollments = {
            enrollment.student.public_id.upper(): enrollment
            for enrollment in Enrollment.objects.filter(course=assessment.course)
            .exclude(status__in=[EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED])
            .select_related("student")
        }

        prepared, errors = [], []
        for index, row in enumerate(rows):
            public_id = row["student_public_id"].strip().upper()
            enrollment = enrollments.get(public_id)

            if enrollment is None:
                errors.append(f"row {index}: {row['student_public_id']} is not in this class.")
                continue
            if row["score"] < Decimal("0"):
                errors.append(f"row {index}: a score cannot be negative.")
                continue
            if row["score"] > assessment.max_score:
                errors.append(
                    f"row {index}: {row['score']} exceeds the maximum of {assessment.max_score}."
                )
                continue

            prepared.append(
                {
                    "enrollment": enrollment,
                    "score": row["score"],
                    "comment": row.get("comment", ""),
                }
            )

        if errors:
            raise serializers.ValidationError(errors)
        return prepared


class AssessmentComponentSerializer(serializers.Serializer):
    assessment_id = serializers.IntegerField()
    title = serializers.CharField()
    kind = serializers.ChoiceField(choices=AssessmentKind.choices)
    score = serializers.DecimalField(max_digits=6, decimal_places=2)
    max_score = serializers.DecimalField(max_digits=6, decimal_places=2)
    weight = serializers.DecimalField(max_digits=5, decimal_places=2)
    percentage = serializers.DecimalField(max_digits=6, decimal_places=2)
    is_published = serializers.BooleanField()


class AverageSerializer(serializers.Serializer):
    weighted_percentage = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    marked_count = serializers.IntegerField()
    assessment_count = serializers.IntegerField()
    components = AssessmentComponentSerializer(many=True)


class GradebookRowSerializer(serializers.Serializer):
    enrollment_id = serializers.IntegerField()
    student_public_id = serializers.CharField()
    student_name = serializers.CharField()
    age = serializers.IntegerField(allow_null=True)
    wilaya = serializers.CharField(allow_blank=True)
    prior_level = serializers.CharField(allow_blank=True)
    weighted_percentage = serializers.DecimalField(
        max_digits=6, decimal_places=2, allow_null=True
    )
    marked_count = serializers.IntegerField()
    assessment_count = serializers.IntegerField()


class GradebookSerializer(serializers.Serializer):
    course_public_id = serializers.CharField()
    course_title = serializers.CharField()
    students = GradebookRowSerializer(many=True)
