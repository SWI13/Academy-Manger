"""
The custom user model.

Only the identity fields live here. Role-specific data goes in StudentProfile
and ProfessorProfile (Phase 6); the multi-role UserRole table arrives with rbac
in Phase 5. Login, password reset and account activation are Phase 4 - this
module exists in Phase 1 for one reason:

    AUTH_USER_MODEL must be set before the first migration runs. Changing it
    afterwards means hand-writing a data migration across every foreign key
    that points at the user table.

So the model ships now, minimal but correct, and later phases add to it.
"""

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.core.validators import RegexValidator
from django.db import models, transaction
from django.utils import timezone

from apps.core.enums import RoleCode, UserStatus
from apps.core.identifiers import next_user_identifier
from apps.core.models import TimeStampedModel

phone_validator = RegexValidator(
    regex=r"^\+?[0-9]{6,20}$",
    message="Enter a phone number in international or local digits, optionally starting with +.",
)


class UserManager(BaseUserManager):
    """
    Accounts are created by authorised staff, never by public sign-up, so there
    is no `register` path - only this manager and the API that wraps it.
    """

    @transaction.atomic
    def create_user(
        self,
        *,
        first_name: str,
        last_name: str,
        primary_role: str,
        phone: str = "",
        email: str | None = None,
        password: str | None = None,
        **extra,
    ):
        if primary_role not in RoleCode.values:
            raise ValueError(f"Unknown role {primary_role!r}")

        user = self.model(
            public_id=next_user_identifier(primary_role),
            first_name=first_name.strip(),
            last_name=last_name.strip(),
            primary_role=primary_role,
            phone=phone.strip(),
            email=self.normalize_email(email) if email else None,
            **extra,
        )
        # set_password hashes with Argon2; a None password produces an
        # unusable hash, so the account exists but cannot be logged into until
        # a password is set.
        user.set_password(password)
        user.full_clean(exclude=["password"])
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, TimeStampedModel):
    # System-generated and stable: STU-000001, PROF-000021, REC-000003.
    public_id = models.CharField(max_length=20, unique=True, editable=False)

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)

    phone = models.CharField(
        max_length=20,
        unique=True,
        null=True,
        blank=True,
        validators=[phone_validator],
        help_text="Optional second login identifier.",
    )
    email = models.EmailField(unique=True, null=True, blank=True)

    # Denormalised routing hint: which dashboard to land on, and which prefix
    # the public_id took. Authorisation reads the full role set from UserRole
    # (Phase 5), never this field.
    primary_role = models.CharField(max_length=16, choices=RoleCode.choices)

    status = models.CharField(
        max_length=16, choices=UserStatus.choices, default=UserStatus.ACTIVE, db_index=True
    )
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    objects = UserManager()

    USERNAME_FIELD = "public_id"
    REQUIRED_FIELDS = ["first_name", "last_name", "primary_role"]

    class Meta:
        db_table = "accounts_user"
        indexes = [models.Index(fields=["status", "primary_role"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status="ACTIVE", deactivated_at__isnull=True)
                | ~models.Q(status="ACTIVE"),
                name="active_users_have_no_deactivation_timestamp",
            )
        ]

    def __str__(self) -> str:
        return f"{self.public_id} - {self.get_full_name()}"

    def get_full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self) -> str:
        return self.first_name

    @property
    def is_active(self) -> bool:
        """
        Django's authentication backend refuses to log in a user for whom this
        is false, so deactivation and suspension take effect on the next
        request - which is the whole reason sessions live server-side.
        """
        return self.status == UserStatus.ACTIVE

    def deactivate(self, *, by=None) -> None:
        self.status = UserStatus.INACTIVE
        self.deactivated_at = timezone.now()
        self.deactivated_by = by
        self.save(update_fields=["status", "deactivated_at", "deactivated_by", "updated_at"])

    def reactivate(self) -> None:
        self.status = UserStatus.ACTIVE
        self.deactivated_at = None
        self.deactivated_by = None
        self.save(update_fields=["status", "deactivated_at", "deactivated_by", "updated_at"])
