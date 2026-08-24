"""
Cache invalidation, wired to the models rather than to the call sites.

The service functions already bump the version when they change a role. These
signals catch every other route into the tables - the shell, a data migration,
a bulk update, a future viewset whose author did not know about the cache.

A stale permission set that still grants a revoked power is a security bug, so
the invalidation must not depend on anyone remembering to call it.
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import RolePermission, UserRole
from .services import bump_version


@receiver(post_save, sender=RolePermission)
@receiver(post_delete, sender=RolePermission)
@receiver(post_save, sender=UserRole)
@receiver(post_delete, sender=UserRole)
def invalidate_permission_cache(sender, **kwargs):
    bump_version()
