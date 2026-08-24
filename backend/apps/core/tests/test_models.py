"""Soft-delete semantics. Financial and educational records are never removed."""

import pytest

from apps.accounts.models import User
from apps.core.enums import UserStatus


@pytest.fixture
def owner(db):
    return User.objects.create_user(
        first_name="Amine",
        last_name="Benali",
        primary_role="OWNER",
        phone="+213555000001",
        password="correct-horse-battery",
    )


@pytest.mark.django_db
def test_timestamps_are_populated(owner):
    assert owner.created_at is not None
    assert owner.updated_at is not None


@pytest.mark.django_db
def test_updated_at_moves_on_save(owner):
    before = owner.updated_at
    owner.first_name = "Amina"
    owner.save()
    owner.refresh_from_db()
    assert owner.updated_at > before


@pytest.mark.django_db
def test_deactivation_records_who_and_when(owner):
    target = User.objects.create_user(
        first_name="Yacine",
        last_name="Haddad",
        primary_role="RECEPTION",
        phone="+213555000002",
        password="correct-horse-battery",
    )

    target.deactivate(by=owner)
    target.refresh_from_db()

    assert target.status == UserStatus.INACTIVE
    assert target.deactivated_at is not None
    assert target.deactivated_by == owner
    # This is what makes revocation immediate: the auth backend refuses login.
    assert target.is_active is False


@pytest.mark.django_db
def test_reactivation_clears_the_deactivation_trail(owner):
    owner.deactivate(by=owner)
    owner.reactivate()
    owner.refresh_from_db()

    assert owner.status == UserStatus.ACTIVE
    assert owner.deactivated_at is None
    assert owner.is_active is True
