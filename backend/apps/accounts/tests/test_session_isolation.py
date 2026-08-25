"""
Clearing the cache must not sign everyone out.

Sessions and the RBAC permission cache used to share one Redis database. The
default cache is scratch space - permission sets live there precisely so they
can be thrown away - so anything that flushed it also flushed every live
session. Granting one receptionist a permission, or a management command
tidying the cache, would have returned the whole institute to a login screen
mid-transaction.

They are separate aliases now. This test is what keeps them separate.
"""

import pytest
from django.conf import settings
from django.core.cache import caches

from apps.rbac.models import Role
from apps.rbac.services import assign_role, bump_version


def test_sessions_use_their_own_cache_alias():
    assert settings.SESSION_CACHE_ALIAS != "default", (
        "Sessions are back on the default cache. Anything that calls "
        "cache.clear() is now a mass logout."
    )
    assert settings.SESSION_CACHE_ALIAS in settings.CACHES


def test_the_two_aliases_are_not_the_same_store():
    caches["sessions"].set("probe", "kept", 60)
    caches["default"].set("scratch", "discardable", 60)

    caches["default"].clear()

    assert caches["default"].get("scratch") is None
    assert caches["sessions"].get("probe") == "kept"


@pytest.mark.django_db
def test_a_signed_in_user_survives_a_permission_cache_flush(logged_in, reception):
    client = logged_in(reception)
    assert client.get("/api/v1/auth/me/").status_code == 200

    # What happens on every role change, and what a cache-tidying command
    # would do. The receptionist is halfway through taking a payment.
    bump_version()
    caches["default"].clear()

    assert client.get("/api/v1/auth/me/").status_code == 200


@pytest.mark.django_db
def test_granting_a_role_does_not_sign_other_people_out(logged_in, reception, student):
    client = logged_in(reception)

    assign_role(student, Role.objects.get(code="PROFESSOR"))

    response = client.get("/api/v1/auth/me/")
    assert response.status_code == 200
    assert response.data["public_id"] == reception.public_id
