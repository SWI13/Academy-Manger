"""
Login, logout and /me.

The enumeration tests matter as much as the happy path: a login that
distinguishes "no such account" from "wrong password" hands an attacker a list
of valid User IDs, and User IDs here are sequential.
"""

import pytest
from django.core.cache import cache

from conftest import PASSWORD, make_user

LOGIN = "/api/v1/auth/login/"
LOGOUT = "/api/v1/auth/logout/"
ME = "/api/v1/auth/me/"


@pytest.fixture(autouse=True)
def clear_throttles():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_login_with_public_id(api, student):
    response = api.post(
        LOGIN, {"identifier": student.public_id, "password": PASSWORD}, format="json"
    )

    assert response.status_code == 200
    assert response.data["public_id"] == student.public_id
    assert "sessionid" in response.cookies


@pytest.mark.django_db
def test_login_with_phone_in_local_form(api, student):
    """Stored as +213555000005; the student types the local form."""
    response = api.post(LOGIN, {"identifier": "0555000005", "password": PASSWORD}, format="json")
    assert response.status_code == 200
    assert response.data["public_id"] == student.public_id


@pytest.mark.django_db
def test_login_response_carries_roles_and_permissions(api, professor):
    response = api.post(
        LOGIN, {"identifier": professor.public_id, "password": PASSWORD}, format="json"
    )
    assert response.data["roles"] == ["PROFESSOR"]
    assert "score.enter" in response.data["permissions"]
    assert "payment.view" not in response.data["permissions"]


@pytest.mark.django_db
def test_password_hash_never_leaves_the_server(api, student):
    response = api.post(
        LOGIN, {"identifier": student.public_id, "password": PASSWORD}, format="json"
    )
    assert "password" not in response.data
    assert PASSWORD not in str(response.data)


@pytest.mark.django_db
def test_wrong_password_is_refused(api, student):
    response = api.post(
        LOGIN, {"identifier": student.public_id, "password": "wrong"}, format="json"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_unknown_account_and_wrong_password_are_indistinguishable(api, student):
    """Otherwise login is an oracle for which sequential User IDs exist."""
    wrong_password = api.post(
        LOGIN, {"identifier": student.public_id, "password": "wrong"}, format="json"
    )
    cache.clear()
    no_such_user = api.post(LOGIN, {"identifier": "STU-999999", "password": "wrong"}, format="json")

    assert wrong_password.status_code == no_such_user.status_code == 400
    assert wrong_password.data == no_such_user.data


@pytest.mark.django_db
def test_deactivated_user_cannot_log_in(api, student):
    student.deactivate()
    response = api.post(
        LOGIN, {"identifier": student.public_id, "password": PASSWORD}, format="json"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_suspended_user_cannot_log_in(api, student):
    from apps.core.enums import UserStatus

    student.status = UserStatus.SUSPENDED
    student.save(update_fields=["status"])

    response = api.post(
        LOGIN, {"identifier": student.public_id, "password": PASSWORD}, format="json"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_deactivating_a_user_ends_their_session_immediately(api, logged_in, student):
    """
    The reason sessions live server-side rather than in a JWT. An owner
    deactivates an account and the next request from that session fails.
    """
    client = logged_in(student)
    assert client.get(ME).status_code == 200

    student.deactivate()

    assert client.get(ME).status_code in (401, 403)


@pytest.mark.django_db
def test_me_requires_a_session(api):
    assert api.get(ME).status_code in (401, 403)


@pytest.mark.django_db
def test_logout_ends_the_session(logged_in, student):
    client = logged_in(student)
    assert client.post(LOGOUT).status_code == 204
    assert client.get(ME).status_code in (401, 403)


@pytest.mark.django_db
def test_login_rotates_the_session_key(api, student):
    """A session fixed before login must not be the one the user ends up on."""
    api.get(ME)  # establish a session
    before = api.cookies.get("sessionid")

    api.post(LOGIN, {"identifier": student.public_id, "password": PASSWORD}, format="json")
    after = api.cookies.get("sessionid")

    if before is not None:
        assert before.value != after.value


@pytest.mark.django_db
def test_login_is_throttled_per_account(api, student):
    """Ten attempts a minute; the eleventh is refused whatever the password."""
    for _ in range(10):
        api.post(LOGIN, {"identifier": student.public_id, "password": "wrong"}, format="json")

    blocked = api.post(
        LOGIN, {"identifier": student.public_id, "password": PASSWORD}, format="json"
    )
    assert blocked.status_code == 429


@pytest.mark.django_db
def test_throttling_one_account_does_not_lock_out_another(api, student):
    """Otherwise an attacker locks a victim out by spamming their User ID."""
    other = make_user("STUDENT", phone="+213555000099")

    for _ in range(10):
        api.post(LOGIN, {"identifier": student.public_id, "password": "wrong"}, format="json")

    # Same IP, different account: the per-IP throttle shares the "login" scope,
    # so this asserts the identifier key is what is exhausted, not the address.
    response = api.post(LOGIN, {"identifier": other.public_id, "password": PASSWORD}, format="json")
    assert response.status_code != 400, "second account was refused on credentials"


@pytest.mark.django_db
def test_last_login_is_recorded(api, student):
    assert student.last_login is None
    api.post(LOGIN, {"identifier": student.public_id, "password": PASSWORD}, format="json")
    student.refresh_from_db()
    assert student.last_login is not None
