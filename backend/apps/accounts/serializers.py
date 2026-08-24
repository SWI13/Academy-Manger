"""
Serializers for authentication.

Fields are listed by name everywhere. `fields = "__all__"` is how a password
hash or a deactivation trail ends up in a response after someone adds a column.
"""

from django.contrib.auth import authenticate, get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.rbac.services import get_permissions

User = get_user_model()


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(
        help_text="User ID (STU-000123) or phone number.", trim_whitespace=True
    )
    password = serializers.CharField(style={"input_type": "password"}, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["identifier"],
            password=attrs["password"],
        )
        if user is None:
            # One message for every failure mode - unknown account, wrong
            # password, deactivated, suspended. Distinguishing them tells an
            # attacker which User IDs are real.
            raise serializers.ValidationError(
                {"identifier": "Those details do not match an active account."}
            )
        attrs["user"] = user
        return attrs


class UserSummarySerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    roles = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "public_id",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "email",
            "primary_role",
            "status",
            "last_login",
            "roles",
            "permissions",
        ]
        read_only_fields = fields

    def get_roles(self, user) -> list[str]:
        return sorted(
            user.user_roles.filter(revoked_at__isnull=True).values_list("role__code", flat=True)
        )

    def get_permissions(self, user) -> list[str]:
        """
        The caller's permission codenames.

        The frontend uses these to decide which controls to render. They are a
        convenience, never an authorization decision - the backend re-checks
        every request, because anything the client sends can be edited.
        """
        return sorted(get_permissions(user))


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(style={"input_type": "password"})
    new_password = serializers.CharField(style={"input_type": "password"})

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Your current password is not correct.")
        return value

    def validate_new_password(self, value):
        user = self.context["request"].user
        try:
            password_validation.validate_password(value, user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def validate(self, attrs):
        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError(
                {"new_password": "The new password must be different from the current one."}
            )
        return attrs


class PasswordResetSerializer(serializers.Serializer):
    """
    Staff-initiated reset.

    There is no self-service reset. Accounts are created by staff, students
    frequently have no email address, and SMS is not in the MVP - so a
    self-service flow would have no delivery channel it could trust. A
    receptionist resets the password and reads the temporary one out.
    """

    public_id = serializers.CharField()

    def validate_public_id(self, value):
        try:
            self.user = User.objects.get(public_id__iexact=value.strip())
        except User.DoesNotExist:
            raise serializers.ValidationError("No user with that ID.") from None
        return value
