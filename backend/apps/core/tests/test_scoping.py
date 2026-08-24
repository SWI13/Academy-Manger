"""
The two gates.

This is the test the whole security model rests on, and the one the brief
called out by name: a student must not reach another student's record by
changing an ID in the URL.
"""

import pytest
from django.core.cache import cache

pytestmark = pytest.mark.urls("apps.core.tests.scoped_urls")

THINGS = "/api/v1/things/"


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


# --- gate 2: does the caller hold the permission at all? --------------------


@pytest.mark.django_db
def test_anonymous_is_refused(api):
    assert api.get(THINGS).status_code in (401, 403)


@pytest.mark.django_db
def test_a_role_without_the_permission_gets_403(logged_in, professor):
    """
    Professors hold user.view but not user.deactivate. 403 is right here:
    the caller is known and the answer is about their role, not about whether
    a particular row exists.
    """
    client = logged_in(professor)
    assert client.delete(f"{THINGS}{professor.pk}/").status_code == 403


@pytest.mark.django_db
def test_an_action_the_view_did_not_map_is_denied(logged_in, owner):
    """Deny by default: 'create' is unmapped, so it is closed even for the owner."""
    client = logged_in(owner)
    response = client.post(THINGS, {"first_name": "X"}, format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_a_view_declaring_no_permission_is_closed(logged_in, owner):
    """Forgetting to declare a requirement must lock the door, not open it."""
    client = logged_in(owner)
    assert client.get("/api/v1/undeclared/").status_code == 403


@pytest.mark.django_db
def test_a_view_forgetting_to_scope_fails_closed_rather_than_leaking(
    logged_in, owner, student, professor
):
    """
    Silently returning every row is the bug the base class exists to prevent.

    A viewset that never implements scope_queryset raises, which the API
    exception handler turns into a generic 500 - the traceback goes to the
    logs, the caller gets nothing. Failing loudly in CI is the point; what
    matters in production is that the response carries no rows.
    """
    client = logged_in(owner)
    response = client.get("/api/v1/unscoped/", raise_request_exception=False)

    assert response.status_code == 500
    body = str(getattr(response, "data", ""))
    for leaked in (student.public_id, professor.public_id, owner.public_id):
        assert leaked not in body


# --- gate 3: which rows may the caller reach? -------------------------------


@pytest.mark.django_db
def test_a_student_listing_sees_only_themselves(logged_in, student, professor, owner):
    client = logged_in(student)
    response = client.get(THINGS)

    assert response.status_code == 200
    returned = [row["public_id"] for row in response.data["results"]]
    assert returned == [student.public_id]


@pytest.mark.django_db
def test_a_student_reading_another_students_record_gets_404_not_403(logged_in, student, professor):
    """
    THE test. 403 would confirm the row exists and let an attacker walk the
    table by incrementing an id; 404 tells them nothing.
    """
    client = logged_in(student)
    response = client.get(f"{THINGS}{professor.pk}/")

    assert response.status_code == 404
    assert response.status_code != 403


@pytest.mark.django_db
def test_a_student_cannot_edit_another_users_record(logged_in, student, professor):
    client = logged_in(student)
    response = client.patch(f"{THINGS}{professor.pk}/", {"first_name": "Hacked"}, format="json")

    assert response.status_code == 404
    professor.refresh_from_db()
    assert professor.first_name != "Hacked"


@pytest.mark.django_db
def test_a_student_can_reach_their_own_record(logged_in, student):
    client = logged_in(student)
    response = client.get(f"{THINGS}{student.pk}/")

    assert response.status_code == 200
    assert response.data["public_id"] == student.public_id


@pytest.mark.django_db
def test_an_unscoped_role_sees_everyone(logged_in, owner, student, professor):
    client = logged_in(owner)
    response = client.get(THINGS)

    returned = {row["public_id"] for row in response.data["results"]}
    assert {owner.public_id, student.public_id, professor.public_id} <= returned


@pytest.mark.django_db
def test_a_nonexistent_id_looks_the_same_as_a_forbidden_one(logged_in, student, professor):
    """Indistinguishable responses are the whole point of returning 404."""
    client = logged_in(student)

    forbidden = client.get(f"{THINGS}{professor.pk}/")
    missing = client.get(f"{THINGS}999999/")

    assert forbidden.status_code == missing.status_code == 404
    assert forbidden.data == missing.data


@pytest.mark.django_db
def test_losing_a_role_mid_session_removes_access(logged_in, student):
    """Revocation must bite on the next request, not at session expiry."""
    from apps.core.enums import RoleCode
    from apps.rbac.models import Role
    from apps.rbac.services import revoke_role

    client = logged_in(student)
    assert client.get(THINGS).status_code == 200

    revoke_role(student, Role.objects.get(code=RoleCode.STUDENT))

    assert client.get(THINGS).status_code == 403
