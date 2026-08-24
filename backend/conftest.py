"""
Shared fixtures.

One user of every role, each with their seeded permissions, because almost
every authorization test is "can role X reach thing Y" and building that by
hand in each module is how coverage gets uneven.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.core.enums import RoleCode
from apps.rbac.models import Role
from apps.rbac.services import assign_role

User = get_user_model()

PASSWORD = "correct-horse-battery-staple"  # noqa: S105 - test fixture

_PHONE_SEQ = {
    RoleCode.OWNER: "+213555000001",
    RoleCode.ADMIN: "+213555000002",
    RoleCode.RECEPTION: "+213555000003",
    RoleCode.PROFESSOR: "+213555000004",
    RoleCode.STUDENT: "+213555000005",
}


def make_user(role_code, *, password=PASSWORD, phone=None, **extra):
    """Create a user and grant them the matching role."""
    user = User.objects.create_user(
        first_name=extra.pop("first_name", "Test"),
        last_name=extra.pop("last_name", role_code.title()),
        primary_role=role_code,
        phone=phone if phone is not None else _PHONE_SEQ.get(role_code),
        password=password,
        **extra,
    )
    assign_role(user, Role.objects.get(code=role_code))
    return user


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def owner(db):
    return make_user(RoleCode.OWNER)


@pytest.fixture
def admin(db):
    return make_user(RoleCode.ADMIN)


@pytest.fixture
def reception(db):
    return make_user(RoleCode.RECEPTION)


@pytest.fixture
def professor(db):
    return make_user(RoleCode.PROFESSOR)


@pytest.fixture
def student(db):
    return make_user(RoleCode.STUDENT)


@pytest.fixture
def all_roles(db):
    """One user per role, keyed by role code."""
    return {code: make_user(code) for code in RoleCode.values}


@pytest.fixture
def logged_in():
    """
    Sign a user in over the real login endpoint, not force_authenticate.

    Returns a *fresh* client each call. Sharing one client would mean
    `logged_in(admin)` silently re-authenticates a session a previous call
    established, so a test that needs two actors - which is exactly what
    separation of duty tests need - would quietly be testing one.
    """

    def _login(user, password=PASSWORD):
        client = APIClient()
        response = client.post(
            "/api/v1/auth/login/",
            {"identifier": user.public_id, "password": password},
            format="json",
        )
        assert response.status_code == 200, response.data
        return client

    return _login
