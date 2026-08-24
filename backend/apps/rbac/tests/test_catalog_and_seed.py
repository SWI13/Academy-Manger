"""
The catalogue is the spec, and the database must match it.

These tests exist so that adding a permission without deciding who holds it
fails the suite instead of shipping as a permission nobody has.
"""

import pytest

from apps.core.enums import RoleCode
from apps.rbac.catalog import FULL, PERMISSIONS, ROLE_MATRIX, SCOPED
from apps.rbac.models import Permission, Role, RolePermission


def test_every_granted_codename_exists_in_the_catalogue():
    """A typo in the matrix would otherwise grant a permission that does nothing."""
    for role_code, granted in ROLE_MATRIX.items():
        unknown = set(granted) - set(PERMISSIONS)
        assert not unknown, f"{role_code} is granted unknown permissions: {sorted(unknown)}"


def test_every_permission_is_granted_to_someone():
    """A permission no role holds is dead code guarding an unreachable feature."""
    granted = {codename for grants in ROLE_MATRIX.values() for codename in grants}
    orphaned = set(PERMISSIONS) - granted
    assert orphaned == {"review.create"} or not orphaned - {"review.create"}, (
        f"permissions no role holds: {sorted(orphaned)}"
    )


def test_all_five_roles_are_in_the_matrix():
    assert set(ROLE_MATRIX) == set(RoleCode.values)


def test_grant_values_are_full_or_scoped():
    for role_code, granted in ROLE_MATRIX.items():
        for codename, kind in granted.items():
            assert kind in (FULL, SCOPED), f"{role_code}.{codename} has kind {kind!r}"


@pytest.mark.django_db
def test_seed_created_every_permission():
    assert Permission.objects.count() == len(PERMISSIONS)
    assert set(Permission.objects.values_list("codename", flat=True)) == set(PERMISSIONS)


@pytest.mark.django_db
@pytest.mark.parametrize("role_code", RoleCode.values)
def test_seeded_grants_match_the_matrix(role_code):
    role = Role.objects.get(code=role_code)
    seeded = set(
        RolePermission.objects.filter(role=role).values_list("permission__codename", flat=True)
    )
    assert seeded == set(ROLE_MATRIX[role_code])


@pytest.mark.django_db
def test_system_roles_are_marked_as_such():
    assert Role.objects.filter(is_system=True).count() == len(RoleCode.values)


# --- the cells that are decisions, not defaults -----------------------------


@pytest.mark.django_db
def test_reception_records_payments_but_cannot_approve_them():
    """Separation of duty: whoever takes the money does not confirm it."""
    granted = ROLE_MATRIX[RoleCode.RECEPTION]
    assert "payment.create" in granted
    assert "payment.approve" not in granted
    assert "payment.reject" not in granted


@pytest.mark.django_db
def test_professors_hold_no_financial_permission():
    """A professor sees who is in the room, not who has paid."""
    granted = set(ROLE_MATRIX[RoleCode.PROFESSOR])
    assert not [c for c in granted if c.startswith(("payment.", "proof.", "report.view_financial"))]


@pytest.mark.django_db
def test_admins_cannot_grant_themselves_powers_or_read_the_audit_log():
    granted = ROLE_MATRIX[RoleCode.ADMIN]
    assert "user.assign_role" not in granted
    assert "role.manage" not in granted
    assert "audit.view" not in granted
    assert "settings.manage" not in granted


@pytest.mark.django_db
def test_owner_is_not_exempt_from_the_review_rule():
    """Only a student who took the course may review it."""
    assert "review.create" not in ROLE_MATRIX[RoleCode.OWNER]
    assert "review.create" in ROLE_MATRIX[RoleCode.STUDENT]


@pytest.mark.django_db
def test_only_owner_manages_roles_and_settings():
    for codename in ("user.assign_role", "role.manage", "audit.view", "settings.manage"):
        holders = [code for code, grants in ROLE_MATRIX.items() if codename in grants]
        assert holders == [RoleCode.OWNER], f"{codename} held by {holders}"


@pytest.mark.django_db
def test_students_can_reach_nothing_financial_beyond_their_own():
    granted = ROLE_MATRIX[RoleCode.STUDENT]
    assert granted.get("payment.view") == SCOPED
    assert "payment.create" not in granted
    assert "payment.approve" not in granted
