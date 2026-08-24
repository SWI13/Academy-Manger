"""
The user model.

Login itself is Phase 4. What is asserted here is the part that has to be right
before any of that exists: identifiers are allocated and stable, passwords are
never stored readable, and account status controls access.
"""

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.accounts.models import User
from apps.core.enums import UserStatus


def make_user(**overrides):
    defaults = {
        "first_name": "Sara",
        "last_name": "Mansouri",
        "primary_role": "STUDENT",
        "phone": "+213555100001",
        "password": "correct-horse-battery",
    }
    return User.objects.create_user(**{**defaults, **overrides})


@pytest.mark.django_db
def test_public_id_is_generated_from_the_role():
    student = make_user()
    professor = make_user(primary_role="PROFESSOR", phone="+213555100002")

    assert student.public_id == "STU-000001"
    assert professor.public_id == "PROF-000001"


@pytest.mark.django_db
def test_public_ids_are_unique_across_users():
    first = make_user()
    second = make_user(phone="+213555100003")
    assert first.public_id != second.public_id


@pytest.mark.django_db
def test_password_is_hashed_not_stored():
    user = make_user(password="correct-horse-battery")

    assert user.password != "correct-horse-battery"
    assert "correct-horse-battery" not in user.password
    assert user.check_password("correct-horse-battery") is True
    assert user.check_password("wrong-password") is False


@pytest.mark.django_db
def test_user_without_a_password_cannot_authenticate():
    """A staff-created account is unusable until a password is set."""
    user = make_user(password=None)
    assert user.has_usable_password() is False
    assert user.check_password("") is False


@pytest.mark.django_db
def test_new_users_are_active():
    assert make_user().status == UserStatus.ACTIVE
    assert make_user(phone="+213555100004").is_active is True


@pytest.mark.django_db
def test_suspended_user_is_not_active():
    user = make_user()
    user.status = UserStatus.SUSPENDED
    user.save(update_fields=["status"])
    assert user.is_active is False


@pytest.mark.django_db
def test_phone_must_be_unique():
    make_user(phone="+213555100005")
    with pytest.raises((IntegrityError, ValidationError)):
        make_user(phone="+213555100005")


@pytest.mark.django_db
def test_unknown_role_is_rejected():
    with pytest.raises(ValueError, match="Unknown role"):
        make_user(primary_role="JANITOR")


@pytest.mark.django_db
def test_email_is_optional():
    user = make_user(email=None)
    assert user.email is None


@pytest.mark.django_db
def test_username_field_is_the_public_id():
    """Staff log in with STU-000001, not with an email address."""
    assert User.USERNAME_FIELD == "public_id"
    user = make_user()
    assert user.get_username() == user.public_id
