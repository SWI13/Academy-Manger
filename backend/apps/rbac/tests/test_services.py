"""
Permission resolution and its cache.

The cache is the risky part. A stale entry that still grants a revoked power
is a security bug, so revocation is tested through every route into the
tables - the service function, a direct model write, and a bulk delete.
"""

import pytest
from django.core.cache import cache

from apps.core.enums import RoleCode
from apps.rbac.catalog import ROLE_MATRIX
from apps.rbac.models import Role, UserRole
from apps.rbac.services import (
    assign_role,
    get_permissions,
    has_permission,
    resolve_permissions,
    revoke_role,
)
from conftest import make_user


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
@pytest.mark.parametrize("role_code", RoleCode.values)
def test_resolved_permissions_match_the_role(role_code):
    user = make_user(role_code)
    assert resolve_permissions(user) == set(ROLE_MATRIX[role_code])


@pytest.mark.django_db
def test_a_user_with_two_roles_gets_the_union(student):
    """The receptionist who also teaches - architecture D-1."""
    assign_role(student, Role.objects.get(code=RoleCode.PROFESSOR))

    permissions = get_permissions(student)
    expected = set(ROLE_MATRIX[RoleCode.STUDENT]) | set(ROLE_MATRIX[RoleCode.PROFESSOR])
    assert permissions == expected
    assert has_permission(student, "score.enter")  # from professor
    assert has_permission(student, "review.create")  # from student


@pytest.mark.django_db
def test_permissions_are_cached_between_calls(django_assert_num_queries, student):
    get_permissions(student)  # warm
    with django_assert_num_queries(0):
        get_permissions(student)


@pytest.mark.django_db
def test_revoking_a_role_takes_effect_immediately(student):
    assert has_permission(student, "review.create")

    revoke_role(student, Role.objects.get(code=RoleCode.STUDENT))

    assert not has_permission(student, "review.create")
    assert get_permissions(student) == frozenset()


@pytest.mark.django_db
def test_revocation_by_direct_model_write_also_invalidates(student):
    """
    Not everything goes through the service layer - a shell session, a data
    migration, a future viewset. The signal has to catch those too.
    """
    assert has_permission(student, "review.create")

    UserRole.objects.filter(user=student).delete()

    assert not has_permission(student, "review.create")


@pytest.mark.django_db
def test_removing_a_permission_from_a_role_affects_everyone_holding_it(student, professor):
    from apps.rbac.models import RolePermission

    assert has_permission(student, "course.view")

    RolePermission.objects.filter(
        role__code=RoleCode.STUDENT, permission__codename="course.view"
    ).delete()

    assert not has_permission(student, "course.view")
    assert has_permission(professor, "course.view")  # unaffected


@pytest.mark.django_db
def test_granting_a_role_is_idempotent(student):
    role = Role.objects.get(code=RoleCode.STUDENT)
    before = UserRole.objects.filter(user=student, revoked_at__isnull=True).count()

    assign_role(student, role)

    assert UserRole.objects.filter(user=student, revoked_at__isnull=True).count() == before


@pytest.mark.django_db
def test_revoking_keeps_the_row_as_history(student):
    role = Role.objects.get(code=RoleCode.STUDENT)
    revoke_role(student, role)

    row = UserRole.objects.get(user=student, role=role)
    assert row.revoked_at is not None
    assert row.is_active is False


@pytest.mark.django_db
def test_a_role_can_be_granted_again_after_revocation(student):
    role = Role.objects.get(code=RoleCode.STUDENT)
    revoke_role(student, role)
    assign_role(student, role)

    assert has_permission(student, "review.create")
    assert UserRole.objects.filter(user=student, role=role).count() == 2


@pytest.mark.django_db
def test_a_deactivated_user_holds_nothing(student):
    assert has_permission(student, "review.create")

    student.deactivate()

    assert get_permissions(student) == frozenset()
    assert not has_permission(student, "review.create")


@pytest.mark.django_db
def test_anonymous_users_hold_nothing():
    from django.contrib.auth.models import AnonymousUser

    assert get_permissions(AnonymousUser()) == frozenset()
    assert get_permissions(None) == frozenset()
