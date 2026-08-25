"""Course and assignment serializers."""

from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.enums import RoleCode
from apps.rbac.services import has_permission

from .models import AssignmentRole, AssignmentStatus, Course, CourseProfessor, CourseStatus

User = get_user_model()


class ProfessorBriefSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = ["public_id", "full_name"]


class CourseProfessorSerializer(serializers.ModelSerializer):
    professor = ProfessorBriefSerializer(read_only=True)

    class Meta:
        model = CourseProfessor
        fields = ["id", "professor", "assignment_role", "status", "assigned_at", "ended_at"]
        read_only_fields = fields


class CourseSerializer(serializers.ModelSerializer):
    professors = serializers.SerializerMethodField()
    seats_taken = serializers.IntegerField(read_only=True)
    seats_remaining = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Course
        fields = [
            "id",
            "public_id",
            "title",
            "description",
            "start_date",
            "end_date",
            "price_minor",
            "currency",
            "capacity",
            "seats_taken",
            "seats_remaining",
            "status",
            "created_at",
            "updated_at",
            "professors",
        ]
        read_only_fields = ["id", "public_id", "created_at", "updated_at"]

    # Annotated for the schema, not for Python. Without this the generated
    # TypeScript types the field as unknown[], and the frontend loses the
    # compile-time check that is the whole reason the types are generated.
    @extend_schema_field(CourseProfessorSerializer(many=True))
    def get_professors(self, course) -> list:
        active = [a for a in course.assignments.all() if a.status == AssignmentStatus.ACTIVE]
        return CourseProfessorSerializer(active, many=True).data

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "A course cannot end before it starts."})
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        actor = getattr(self.context.get("request"), "user", None)
        # Students and professors see the catalogue, not the commercials.
        # Price belongs to whoever handles money.
        if actor and not has_permission(actor, "payment.view"):
            data.pop("price_minor", None)
            data.pop("currency", None)
        return data


class CourseWriteSerializer(CourseSerializer):
    class Meta(CourseSerializer.Meta):
        read_only_fields = ["id", "public_id", "created_at", "updated_at", "status"]


class AssignProfessorSerializer(serializers.Serializer):
    professor_public_id = serializers.CharField()
    assignment_role = serializers.ChoiceField(
        choices=AssignmentRole.choices, default=AssignmentRole.LEAD
    )

    def validate_professor_public_id(self, value):
        try:
            professor = User.objects.get(public_id__iexact=value.strip())
        except User.DoesNotExist:
            raise serializers.ValidationError("No user with that ID.") from None

        if not professor.user_roles.filter(
            role__code=RoleCode.PROFESSOR, revoked_at__isnull=True
        ).exists():
            # Assigning a student to teach a course would give them the
            # professor scope over that course's roster and marks.
            raise serializers.ValidationError("That user is not a professor.")
        if not professor.is_active:
            raise serializers.ValidationError("That professor's account is not active.")

        self.professor = professor
        return value


class CourseStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=CourseStatus.choices)
