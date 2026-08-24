"""
User management serializers.

Every field is listed by name. Financial and administrative fields are dropped
for callers who may not see them, in the serializer rather than the template -
a field the serializer never emits cannot leak through a new view.
"""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from apps.core.enums import RoleCode, UserStatus
from apps.core.phone import normalize_phone
from apps.core.wilayas import Wilaya
from apps.professors.models import ProfessorProfile
from apps.rbac.models import Role
from apps.rbac.services import assign_role, has_permission
from apps.students.models import PriorLevel, StudentProfile

from .scoping import can_manage_role

User = get_user_model()


class StudentProfileSerializer(serializers.ModelSerializer):
    age = serializers.IntegerField(read_only=True)
    wilaya_name = serializers.CharField(source="get_wilaya_display", read_only=True)

    class Meta:
        model = StudentProfile
        fields = [
            "date_of_birth",
            "age",
            "wilaya",
            "wilaya_name",
            "prior_level",
            "address",
            "emergency_contact_name",
            "emergency_contact_phone",
            "notes",
        ]


class ProfessorProfileSerializer(serializers.ModelSerializer):
    wilaya_name = serializers.CharField(source="get_wilaya_display", read_only=True)

    class Meta:
        model = ProfessorProfile
        fields = [
            "specialisation",
            "qualifications",
            "bio",
            "wilaya",
            "wilaya_name",
            "hired_at",
            "hourly_rate_minor",
            "currency",
        ]


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    roles = serializers.SerializerMethodField()
    student_profile = StudentProfileSerializer(read_only=True)
    professor_profile = ProfessorProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "public_id",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "email",
            "primary_role",
            "status",
            "last_login",
            "created_at",
            "roles",
            "student_profile",
            "professor_profile",
        ]
        read_only_fields = ["id", "public_id", "primary_role", "last_login", "created_at"]

    def get_roles(self, user) -> list[str]:
        return sorted(
            r.role.code for r in user.user_roles.all() if r.revoked_at is None
        )

    def validate_phone(self, value):
        try:
            return normalize_phone(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        actor = getattr(request, "user", None)

        # A professor's pay is financial data. Drop it here rather than
        # relying on every future view to remember.
        if data.get("professor_profile") and not (
            actor and has_permission(actor, "report.view_financial")
        ):
            data["professor_profile"].pop("hourly_rate_minor", None)
            data["professor_profile"].pop("currency", None)

        # Administrative notes about a student are for staff, not the student.
        if data.get("student_profile") and actor and actor.pk == instance.pk:
            data["student_profile"].pop("notes", None)

        return data


class UserCreateSerializer(serializers.Serializer):
    """
    Staff create accounts; there is no public registration.

    The profile is created in the same transaction as the user, so a student
    can never exist without the record that makes them a student.
    """

    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    primary_role = serializers.ChoiceField(choices=RoleCode.choices)
    phone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    password = serializers.CharField(required=False, allow_blank=True, write_only=True)

    # Student fields
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    wilaya = serializers.ChoiceField(choices=Wilaya.choices, required=False, allow_blank=True)
    prior_level = serializers.ChoiceField(
        choices=PriorLevel.choices, required=False, allow_blank=True
    )
    address = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(required=False, allow_blank=True)

    # Professor fields
    specialisation = serializers.CharField(required=False, allow_blank=True)
    qualifications = serializers.CharField(required=False, allow_blank=True)
    hired_at = serializers.DateField(required=False, allow_null=True)

    def validate_primary_role(self, value):
        actor = self.context["request"].user
        if not can_manage_role(actor, value):
            # Reception creating an admin is privilege escalation with extra
            # steps. Refused by role, not by hiding the field in the UI.
            raise serializers.ValidationError(
                f"Your role cannot create a {value} account."
            )
        return value

    def validate_phone(self, value):
        try:
            return normalize_phone(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    @transaction.atomic
    def create(self, validated):
        role_code = validated["primary_role"]

        user = User.objects.create_user(
            first_name=validated["first_name"],
            last_name=validated["last_name"],
            primary_role=role_code,
            phone=validated.get("phone"),
            email=validated.get("email") or None,
            password=validated.get("password") or None,
        )
        assign_role(user, Role.objects.get(code=role_code), assigned_by=self.context["request"].user)

        if role_code == RoleCode.STUDENT:
            StudentProfile.objects.create(
                user=user,
                date_of_birth=validated.get("date_of_birth"),
                wilaya=validated.get("wilaya") or "",
                prior_level=validated.get("prior_level") or "",
                address=validated.get("address", ""),
                emergency_contact_name=validated.get("emergency_contact_name", ""),
                emergency_contact_phone=validated.get("emergency_contact_phone", ""),
            )
        elif role_code == RoleCode.PROFESSOR:
            ProfessorProfile.objects.create(
                user=user,
                specialisation=validated.get("specialisation", ""),
                qualifications=validated.get("qualifications", ""),
                hired_at=validated.get("hired_at"),
            )

        return user

    def to_representation(self, instance):
        return UserSerializer(instance, context=self.context).data


class UserUpdateSerializer(serializers.ModelSerializer):
    """
    Editing an existing user.

    public_id, primary_role and status are absent on purpose. The ID is
    immutable, the role changes through the role endpoint so it is auditable,
    and status changes through deactivate/reactivate so the trail is recorded.
    """

    student_profile = StudentProfileSerializer(required=False)
    professor_profile = ProfessorProfileSerializer(required=False)

    class Meta:
        model = User
        fields = ["first_name", "last_name", "phone", "email", "student_profile", "professor_profile"]

    def validate_phone(self, value):
        try:
            return normalize_phone(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    @transaction.atomic
    def update(self, instance, validated):
        student_data = validated.pop("student_profile", None)
        professor_data = validated.pop("professor_profile", None)

        for field, value in validated.items():
            setattr(instance, field, value)
        instance.save()

        if student_data and hasattr(instance, "student_profile"):
            actor = self.context["request"].user
            if actor.pk == instance.pk:
                # A student cannot write their own administrative notes.
                student_data.pop("notes", None)
            for field, value in student_data.items():
                setattr(instance.student_profile, field, value)
            instance.student_profile.save()

        if professor_data and hasattr(instance, "professor_profile"):
            actor = self.context["request"].user
            if not has_permission(actor, "report.view_financial"):
                professor_data.pop("hourly_rate_minor", None)
                professor_data.pop("currency", None)
            for field, value in professor_data.items():
                setattr(instance.professor_profile, field, value)
            instance.professor_profile.save()

        return instance

    def to_representation(self, instance):
        return UserSerializer(instance, context=self.context).data


class RoleAssignmentSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=RoleCode.choices)

    def validate_role(self, value):
        actor = self.context["request"].user
        target = self.context["target"]
        if actor.pk == target.pk:
            # Nobody grants themselves a role, owner included. Self-escalation
            # is the attack this closes.
            raise serializers.ValidationError("You cannot change your own roles.")
        if not can_manage_role(actor, value):
            raise serializers.ValidationError(f"Your role cannot grant {value}.")
        return value


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=UserStatus.choices)
    reason = serializers.CharField(required=False, allow_blank=True)
