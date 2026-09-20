"""
The organisation profile.

Two rules, and they pull in opposite directions on purpose: everybody signed
in may read it, because the header of every printed document is built from it
and a receptionist printing a receipt is not exercising a special power - and
only `settings.manage` may change it, which in the seed matrix is the owner
alone.
"""

import pytest
from django.core.cache import cache

from apps.audit.models import AuditAction, AuditLog
from apps.core.models import Organisation

ORGANISATION = "/api/v1/organisation/"


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


# ---------------------------------------------------------------------------
# One row, ever
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_the_profile_is_seeded_so_the_first_report_has_a_header():
    assert Organisation.objects.count() == 1
    assert Organisation.load().name == "SM Academy"


@pytest.mark.django_db
def test_there_is_only_ever_one_profile():
    """
    A second row would be two answers to what this institute is called, and no
    rule about which one a report picks up.

    Held in two places, which is the point. `save()` pins the primary key, so
    code going through `load()` - which is every code path in the platform -
    can never make a second row however many times it saves. And the primary
    key itself refuses one from code that goes around `load()`, which is what
    makes the guarantee a guarantee rather than a convention.
    """
    from django.db import IntegrityError, transaction

    first = Organisation.load()
    first.name = "SM Academy Oran"
    first.save()

    assert Organisation.load().pk == first.pk
    assert Organisation.objects.count() == 1
    assert Organisation.load().name == "SM Academy Oran"

    with pytest.raises(IntegrityError), transaction.atomic():
        Organisation.objects.create(name="Somewhere else")


@pytest.mark.django_db
def test_the_profile_cannot_be_deleted():
    from django.db import IntegrityError

    with pytest.raises(IntegrityError):
        Organisation.load().delete()


@pytest.mark.django_db
def test_the_address_and_contact_lines_are_composed_on_the_server():
    """So "address" means the same thing on a receipt and on a register."""
    organisation = Organisation.load()
    organisation.address_line = "12 rue Didouche Mourad"
    organisation.city = "Alger Centre"
    organisation.wilaya = "Alger"
    organisation.phone = "+213 21 00 00 00"
    organisation.email = "contact@sm-academy.dz"
    organisation.save()

    assert organisation.address == "12 rue Didouche Mourad, Alger Centre, Alger"
    assert organisation.contact_line == "+213 21 00 00 00 · contact@sm-academy.dz"


@pytest.mark.django_db
def test_blank_lines_are_left_out_rather_than_printed_as_separators():
    organisation = Organisation.load()
    organisation.city = "Oran"
    organisation.save()
    assert organisation.address == "Oran"
    assert organisation.contact_line == ""


# ---------------------------------------------------------------------------
# Reading it
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("role", ["owner", "admin", "reception", "professor", "student"])
@pytest.mark.django_db
def test_everybody_signed_in_can_read_the_profile(request, logged_in, role):
    """Every printed document opens with it, including a student's own timetable."""
    response = logged_in(request.getfixturevalue(role)).get(ORGANISATION)
    assert response.status_code == 200
    assert response.data["name"] == "SM Academy"


@pytest.mark.django_db
def test_an_anonymous_caller_cannot_read_it(api):
    assert api.get(ORGANISATION).status_code in (401, 403)


@pytest.mark.django_db
def test_the_payload_says_whether_the_caller_may_edit_it(logged_in, owner, reception):
    """So the settings screen does not have to work it out from a permission list."""
    assert logged_in(owner).get(ORGANISATION).data["can_manage"] is True
    assert logged_in(reception).get(ORGANISATION).data["can_manage"] is False


# ---------------------------------------------------------------------------
# Changing it
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_the_owner_edits_the_profile(logged_in, owner):
    response = logged_in(owner).patch(
        ORGANISATION,
        {"name": "SM Academy Oran", "phone": "+213 41 00 00 00"},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["name"] == "SM Academy Oran"
    assert Organisation.load().phone == "+213 41 00 00 00"


@pytest.mark.parametrize("role", ["admin", "reception", "professor", "student"])
@pytest.mark.django_db
def test_only_settings_manage_may_change_it(request, logged_in, role):
    """Not even an admin. `settings.manage` is the owner's alone in the seed matrix."""
    response = logged_in(request.getfixturevalue(role)).patch(
        ORGANISATION, {"name": "Renamed"}, format="json"
    )
    assert response.status_code == 403
    assert Organisation.load().name == "SM Academy"


@pytest.mark.django_db
def test_the_institute_cannot_be_left_without_a_name(logged_in, owner):
    """A sheet of paper nobody can attribute is worse than no sheet of paper."""
    response = logged_in(owner).patch(ORGANISATION, {"name": "   "}, format="json")
    assert response.status_code == 400
    assert "name" in response.data["error"]["details"]


@pytest.mark.django_db
def test_a_change_is_recorded_with_both_values(logged_in, owner):
    logged_in(owner).patch(ORGANISATION, {"phone": "+213 41 00 00 00"}, format="json")

    entry = AuditLog.objects.filter(action=AuditAction.ORGANISATION_UPDATED).first()
    assert entry is not None
    assert entry.actor_public_id == owner.public_id
    assert entry.old_values == {"phone": ""}
    assert entry.new_values == {"phone": "+213 41 00 00 00"}


@pytest.mark.django_db
def test_a_change_that_changes_nothing_writes_no_audit_row(logged_in, owner):
    logged_in(owner).patch(ORGANISATION, {"name": "SM Academy"}, format="json")
    assert not AuditLog.objects.filter(action=AuditAction.ORGANISATION_UPDATED).exists()
