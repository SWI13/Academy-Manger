"""
Permission resolution.

Resolving a user's permissions is two joins deep - user -> roles ->
permissions - and it happens on every authenticated request. So it is cached.

Invalidation is by global version stamp rather than by deleting individual
keys. A permission change is rare (an owner editing a role) and a missed
invalidation is a security bug that grants access after it was revoked. Bumping
one counter makes every cached set unreachable at once: blunt, and impossible
to get subtly wrong. Stale entries fall out on TTL.
"""

import logging

from django.core.cache import cache

from .models import UserRole

logger = logging.getLogger(__name__)

_VERSION_KEY = "rbac:version"
_CACHE_TTL = 60 * 30  # half an hour; the version stamp does the real work


def _current_version() -> int:
    version = cache.get(_VERSION_KEY)
    if version is None:
        version = 1
        cache.set(_VERSION_KEY, version, timeout=None)
    return version


def bump_version() -> int:
    """
    Invalidate every cached permission set.

    Call after any change to RolePermission or UserRole. Cheap, and the only
    version that cannot silently leave a revoked permission in place.
    """
    try:
        return cache.incr(_VERSION_KEY)
    except ValueError:
        # Key absent or evicted: seed it. Any set cached under the old version
        # is already unreachable, so starting from 1 is safe.
        cache.set(_VERSION_KEY, 1, timeout=None)
        return 1


def _cache_key(user_id: int, version: int) -> str:
    return f"rbac:perms:{user_id}:v{version}"


def resolve_permissions(user) -> frozenset[str]:
    """Read a user's permission codenames straight from the database."""
    codenames = (
        UserRole.objects.filter(user=user, revoked_at__isnull=True)
        .values_list("role__role_permissions__permission__codename", flat=True)
        .distinct()
    )
    return frozenset(c for c in codenames if c)


def get_permissions(user) -> frozenset[str]:
    """
    A user's permission codenames, cached.

    An inactive user holds nothing, checked here as well as in the
    authentication layer - a deactivated account must lose access on its very
    next request, and defence in depth on that is worth one comparison.
    """
    if not user or not user.is_authenticated:
        return frozenset()
    if not user.is_active:
        return frozenset()

    version = _current_version()
    key = _cache_key(user.pk, version)

    cached = cache.get(key)
    if cached is not None:
        return frozenset(cached)

    permissions = resolve_permissions(user)
    cache.set(key, list(permissions), timeout=_CACHE_TTL)
    return permissions


def has_permission(user, codename: str) -> bool:
    """
    Whether `user` holds `codename` at all.

    This is gate 2. It answers "may this user approve payments" and says
    nothing about *which* payments - that is gate 3, the scoped queryset in
    apps.core.viewsets. Both are required.
    """
    return codename in get_permissions(user)


def assign_role(user, role, *, assigned_by=None) -> UserRole:
    """Grant a role, reactivating a previously revoked grant if there is one."""
    from django.utils import timezone

    existing = UserRole.objects.filter(user=user, role=role, revoked_at__isnull=True).first()
    if existing:
        return existing

    user_role = UserRole.objects.create(
        user=user, role=role, assigned_by=assigned_by, assigned_at=timezone.now()
    )
    bump_version()
    logger.info("Role %s granted to %s by %s", role.code, user.public_id, assigned_by)
    return user_role


def revoke_role(user, role, *, revoked_by=None) -> int:
    """Revoke a role by timestamp. Never deletes - who held what is history."""
    from django.utils import timezone

    updated = UserRole.objects.filter(user=user, role=role, revoked_at__isnull=True).update(
        revoked_at=timezone.now(), revoked_by=revoked_by
    )
    if updated:
        bump_version()
        logger.info("Role %s revoked from %s by %s", role.code, user.public_id, revoked_by)
    return updated
