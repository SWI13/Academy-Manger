"""
User management, and the privilege boundaries around it.

The escalation tests matter most: an account-creation endpoint that does not
bound which role the caller may hand out is a way for reception to make itself
an owner.
"""

import pytest
from django.core.cache import cache

from apps.core.enums import UserStatus
from apps.students.models import StudentProfile

USERS = "/api/v1/users/"


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


def student_payload(**overrides):
    return {
        "first_name": "Yasmine",
        "last_name": "Belkacem",
        "primary_role": "STUDENT",
        "phone": "0555123456",
        "date_of_birth": "2005-04-12",
        "wilaya": "16",
        "prior_level": "INTERMEDIATE",
        **overrides,
    }


# --- creation ---------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize("actor_fixture", ["owner", "admin", "reception"])
def test_staff_can_create_a_student(request, logged_in, actor_fixture):
    client = logged_in(request.getfixturevalue(actor_fixture))
    response = client.post(USERS, student_payload(), format="json")

    assert response.status_code == 201, response.data
    assert response.data["public_id"].startswith("STU-")
    assert response.data["roles"] == ["STUDENT"]
    assert response.data["phone"] == "+213555123456"


@pytest.mark.django_db
def test_creating_a_student_creates_their_profile(logged_in, reception):
    client = logged_in(reception)
    response = client.post(USERS, student_payload(), format="json")

    profile = StudentProfile.objects.get(user__public_id=response.data["public_id"])
    assert profile.wilaya == "16"
    assert profile.prior_level == "INTERMEDIATE"


@pytest.mark.django_db
def test_age_is_derived_not_stored(logged_in, reception):
    client = logged_in(reception)
    response = client.post(USERS, student_payload(date_of_birth="2000-01-01"), format="json")

    age = response.data["student_profile"]["age"]
    assert age is not None and age >= 25
    assert "age" not in [f.name for f in StudentProfile._meta.get_fields()]


@pytest.mark.django_db
def test_reception_cannot_create_an_admin(logged_in, reception):
    """Privilege escalation with extra steps. Refused by role, not hidden in the UI."""
    client = logged_in(reception)
    response = client.post(
        USERS, student_payload(primary_role="ADMIN", phone="0555123457"), format="json"
    )
    assert response.status_code == 400
    assert "primary_role" in response.data["error"]["details"]


@pytest.mark.django_db
def test_reception_cannot_create_an_owner(logged_in, reception):
    client = logged_in(reception)
    response = client.post(
        USERS, student_payload(primary_role="OWNER", phone="0555123458"), format="json"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_admin_cannot_create_an_owner(logged_in, admin):
    client = logged_in(admin)
    response = client.post(
        USERS, student_payload(primary_role="OWNER", phone="0555123459"), format="json"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_owner_can_create_an_admin(logged_in, owner):
    client = logged_in(owner)
    response = client.post(
        USERS, student_payload(primary_role="ADMIN", phone="0555123460"), format="json"
    )
    assert response.status_code == 201


@pytest.mark.django_db
@pytest.mark.parametrize("actor_fixture", ["professor", "student"])
def test_non_staff_cannot_create_users(request, logged_in, actor_fixture):
    client = logged_in(request.getfixturevalue(actor_fixture))
    response = client.post(USERS, student_payload(phone="0555123461"), format="json")
    assert response.status_code == 403


# --- reading and scope ------------------------------------------------------


@pytest.mark.django_db
def test_a_student_sees_only_themselves(logged_in, student, professor, owner):
    client = logged_in(student)
    response = client.get(USERS)

    returned = [row["public_id"] for row in response.data["results"]]
    assert returned == [student.public_id]


@pytest.mark.django_db
def test_a_student_reading_another_user_gets_404(logged_in, student, professor):
    """Changing an ID in the URL must not reveal that the record exists."""
    client = logged_in(student)
    assert client.get(f"{USERS}{professor.public_id}/").status_code == 404


@pytest.mark.django_db
def test_reception_cannot_read_the_owner_account(logged_in, reception, owner):
    """Reception serves students; owner accounts are an escalation target."""
    client = logged_in(reception)
    assert client.get(f"{USERS}{owner.public_id}/").status_code == 404


@pytest.mark.django_db
def test_reception_can_read_students_and_professors(logged_in, reception, student, professor):
    client = logged_in(reception)
    assert client.get(f"{USERS}{student.public_id}/").status_code == 200
    assert client.get(f"{USERS}{professor.public_id}/").status_code == 200


@pytest.mark.django_db
def test_owner_sees_everyone(logged_in, owner, admin, reception, professor, student):
    client = logged_in(owner)
    returned = {row["public_id"] for row in client.get(USERS).data["results"]}
    for user in (owner, admin, reception, professor, student):
        assert user.public_id in returned


# --- search -----------------------------------------------------------------


@pytest.mark.django_db
def test_search_by_public_id(logged_in, reception, student):
    client = logged_in(reception)
    response = client.get(USERS, {"q": student.public_id})
    assert [r["public_id"] for r in response.data["results"]] == [student.public_id]


@pytest.mark.django_db
def test_search_by_name(logged_in, reception):
    client = logged_in(reception)
    client.post(USERS, student_payload(first_name="Yasmine", phone="0555123470"), format="json")

    response = client.get(USERS, {"q": "yasmi"})
    assert response.data["count"] == 1


@pytest.mark.django_db
def test_search_by_phone(logged_in, reception):
    client = logged_in(reception)
    client.post(USERS, student_payload(phone="0555123471"), format="json")

    response = client.get(USERS, {"q": "555123471"})
    assert response.data["count"] == 1


@pytest.mark.django_db
def test_filter_by_role(logged_in, owner, student, professor):
    client = logged_in(owner)
    response = client.get(USERS, {"role": "PROFESSOR"})
    assert all(r["primary_role"] == "PROFESSOR" for r in response.data["results"])


# --- editing ----------------------------------------------------------------


@pytest.mark.django_db
def test_a_student_can_edit_their_own_details(logged_in, student):
    client = logged_in(student)
    response = client.patch(
        f"{USERS}{student.public_id}/", {"first_name": "Renamed"}, format="json"
    )
    assert response.status_code == 200
    student.refresh_from_db()
    assert student.first_name == "Renamed"


@pytest.mark.django_db
def test_a_student_cannot_edit_someone_else(logged_in, student, professor):
    client = logged_in(student)
    response = client.patch(
        f"{USERS}{professor.public_id}/", {"first_name": "Hacked"}, format="json"
    )
    assert response.status_code == 404
    professor.refresh_from_db()
    assert professor.first_name != "Hacked"


@pytest.mark.django_db
def test_public_id_cannot_be_changed(logged_in, owner, student):
    client = logged_in(owner)
    original = student.public_id
    client.patch(f"{USERS}{original}/", {"public_id": "STU-999999"}, format="json")

    student.refresh_from_db()
    assert student.public_id == original


@pytest.mark.django_db
def test_role_cannot_be_changed_through_the_edit_endpoint(logged_in, owner, student):
    """Role changes go through the roles endpoint so they are attributable."""
    client = logged_in(owner)
    client.patch(f"{USERS}{student.public_id}/", {"primary_role": "OWNER"}, format="json")

    student.refresh_from_db()
    assert student.primary_role == "STUDENT"


@pytest.mark.django_db
def test_a_student_cannot_write_their_own_administrative_notes(logged_in, owner, student):
    StudentProfile.objects.create(user=student, notes="Original note")

    client = logged_in(student)
    client.patch(
        f"{USERS}{student.public_id}/",
        {"student_profile": {"notes": "Rewritten by the student"}},
        format="json",
    )

    student.student_profile.refresh_from_db()
    assert student.student_profile.notes == "Original note"


@pytest.mark.django_db
def test_students_do_not_see_their_own_administrative_notes(logged_in, student):
    StudentProfile.objects.create(user=student, notes="Struggling with attendance")

    client = logged_in(student)
    response = client.get(f"{USERS}{student.public_id}/")

    assert "notes" not in response.data["student_profile"]


@pytest.mark.django_db
def test_staff_do_see_administrative_notes(logged_in, reception, student):
    StudentProfile.objects.create(user=student, notes="Struggling with attendance")

    client = logged_in(reception)
    response = client.get(f"{USERS}{student.public_id}/")

    assert response.data["student_profile"]["notes"] == "Struggling with attendance"


# --- professor pay is financial data ----------------------------------------


@pytest.mark.django_db
def test_hourly_rate_hidden_from_roles_without_financial_permission(
    logged_in, reception, professor
):
    from apps.professors.models import ProfessorProfile

    ProfessorProfile.objects.create(user=professor, hourly_rate_minor=250000)

    client = logged_in(reception)
    response = client.get(f"{USERS}{professor.public_id}/")

    assert "hourly_rate_minor" not in response.data["professor_profile"]


@pytest.mark.django_db
def test_hourly_rate_visible_to_the_owner(logged_in, owner, professor):
    from apps.professors.models import ProfessorProfile

    ProfessorProfile.objects.create(user=professor, hourly_rate_minor=250000)

    client = logged_in(owner)
    response = client.get(f"{USERS}{professor.public_id}/")

    assert response.data["professor_profile"]["hourly_rate_minor"] == 250000


# --- status and roles -------------------------------------------------------


@pytest.mark.django_db
def test_owner_can_deactivate_a_user(logged_in, owner, student):
    client = logged_in(owner)
    response = client.post(
        f"{USERS}{student.public_id}/status/", {"status": "INACTIVE"}, format="json"
    )

    assert response.status_code == 200
    student.refresh_from_db()
    assert student.status == UserStatus.INACTIVE
    assert student.deactivated_by == owner


@pytest.mark.django_db
def test_nobody_can_deactivate_themselves(logged_in, owner):
    """Locking the last owner out of their own platform is not a feature."""
    client = logged_in(owner)
    response = client.post(
        f"{USERS}{owner.public_id}/status/", {"status": "INACTIVE"}, format="json"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_reception_cannot_deactivate_anyone(logged_in, reception, student):
    client = logged_in(reception)
    response = client.post(
        f"{USERS}{student.public_id}/status/", {"status": "INACTIVE"}, format="json"
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_owner_can_grant_a_second_role(logged_in, owner, reception):
    """The receptionist who also teaches - architecture D-1."""
    client = logged_in(owner)
    response = client.post(
        f"{USERS}{reception.public_id}/roles/", {"role": "PROFESSOR"}, format="json"
    )

    assert response.status_code == 200
    assert set(response.data["roles"]) == {"RECEPTION", "PROFESSOR"}


@pytest.mark.django_db
def test_nobody_can_grant_themselves_a_role(logged_in, owner):
    """Self-escalation, closed even for the owner."""
    client = logged_in(owner)
    response = client.post(f"{USERS}{owner.public_id}/roles/", {"role": "STUDENT"}, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_admin_cannot_assign_roles_at_all(logged_in, admin, student):
    """user.assign_role is owner-only - an admin cannot build themselves a ladder."""
    client = logged_in(admin)
    response = client.post(f"{USERS}{student.public_id}/roles/", {"role": "ADMIN"}, format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_revoking_a_role_removes_its_permissions(logged_in, owner, reception):
    client = logged_in(owner)
    client.post(f"{USERS}{reception.public_id}/roles/", {"role": "PROFESSOR"}, format="json")
    response = client.delete(
        f"{USERS}{reception.public_id}/roles/", {"role": "PROFESSOR"}, format="json"
    )

    assert response.status_code == 200
    assert response.data["roles"] == ["RECEPTION"]


@pytest.mark.django_db
def test_users_cannot_be_deleted(logged_in, owner, student):
    """Their enrolments, payments and marks must stay attributable."""
    client = logged_in(owner)
    assert client.delete(f"{USERS}{student.public_id}/").status_code == 405
