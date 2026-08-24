"""Password change and staff-initiated reset."""

import pytest
from django.core.cache import cache

from conftest import PASSWORD

CHANGE = "/api/v1/auth/password/change/"
RESET = "/api/v1/auth/password/reset/"
ME = "/api/v1/auth/me/"

NEW_PASSWORD = "a-completely-different-secret-9"  # noqa: S105 - test fixture


@pytest.fixture(autouse=True)
def clear_throttles():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_user_can_change_their_own_password(logged_in, student):
    client = logged_in(student)
    response = client.post(
        CHANGE, {"current_password": PASSWORD, "new_password": NEW_PASSWORD}, format="json"
    )

    assert response.status_code == 204
    student.refresh_from_db()
    assert student.check_password(NEW_PASSWORD)


@pytest.mark.django_db
def test_wrong_current_password_is_refused(logged_in, student):
    client = logged_in(student)
    response = client.post(
        CHANGE, {"current_password": "not-it", "new_password": NEW_PASSWORD}, format="json"
    )

    assert response.status_code == 400
    student.refresh_from_db()
    assert student.check_password(PASSWORD)


@pytest.mark.django_db
def test_weak_passwords_are_rejected(logged_in, student):
    client = logged_in(student)
    response = client.post(
        CHANGE, {"current_password": PASSWORD, "new_password": "password"}, format="json"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_new_password_must_differ_from_the_old_one(logged_in, student):
    client = logged_in(student)
    response = client.post(
        CHANGE, {"current_password": PASSWORD, "new_password": PASSWORD}, format="json"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_changing_password_keeps_the_current_session_alive(logged_in, student):
    """The user should not be logged out of the browser they just used."""
    client = logged_in(student)
    client.post(CHANGE, {"current_password": PASSWORD, "new_password": NEW_PASSWORD}, format="json")
    assert client.get(ME).status_code == 200


@pytest.mark.django_db
def test_changing_password_kills_other_sessions(api, logged_in, student):
    """
    A session stolen from a shared reception machine dies when the password
    changes, because the session auth hash derives from it.
    """
    from rest_framework.test import APIClient

    other_device = APIClient()
    other_device.post(
        "/api/v1/auth/login/",
        {"identifier": student.public_id, "password": PASSWORD},
        format="json",
    )
    assert other_device.get(ME).status_code == 200

    this_device = logged_in(student)
    this_device.post(
        CHANGE, {"current_password": PASSWORD, "new_password": NEW_PASSWORD}, format="json"
    )

    assert other_device.get(ME).status_code in (401, 403)


@pytest.mark.django_db
def test_anonymous_cannot_change_a_password(api, student):
    response = api.post(
        CHANGE, {"current_password": PASSWORD, "new_password": NEW_PASSWORD}, format="json"
    )
    assert response.status_code in (401, 403)


# --- staff-initiated reset --------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize("actor_fixture", ["owner", "admin"])
def test_privileged_roles_can_reset_a_password(request, logged_in, student, actor_fixture):
    actor = request.getfixturevalue(actor_fixture)
    client = logged_in(actor)

    response = client.post(RESET, {"public_id": student.public_id}, format="json")

    assert response.status_code == 200
    temporary = response.data["temporary_password"]
    student.refresh_from_db()
    assert student.check_password(temporary)


@pytest.mark.django_db
@pytest.mark.parametrize("actor_fixture", ["reception", "professor", "student"])
def test_unprivileged_roles_cannot_reset_a_password(request, logged_in, owner, actor_fixture):
    """Reception has no user.reset_password - it is an account takeover primitive."""
    actor = request.getfixturevalue(actor_fixture)
    client = logged_in(actor)

    response = client.post(RESET, {"public_id": owner.public_id}, format="json")

    assert response.status_code == 403
    owner.refresh_from_db()
    assert owner.check_password(PASSWORD)


@pytest.mark.django_db
def test_reset_locks_out_the_previous_session(api, logged_in, owner, student):
    """A reset is meant to lock out whoever was using the account."""
    from rest_framework.test import APIClient

    victim_session = APIClient()
    victim_session.post(
        "/api/v1/auth/login/",
        {"identifier": student.public_id, "password": PASSWORD},
        format="json",
    )
    assert victim_session.get(ME).status_code == 200

    logged_in(owner).post(RESET, {"public_id": student.public_id}, format="json")

    assert victim_session.get(ME).status_code in (401, 403)


@pytest.mark.django_db
def test_reset_of_an_unknown_user_is_a_validation_error(logged_in, owner):
    response = logged_in(owner).post(RESET, {"public_id": "STU-999999"}, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_anonymous_cannot_reset_a_password(api, student):
    response = api.post(RESET, {"public_id": student.public_id}, format="json")
    assert response.status_code in (401, 403)
