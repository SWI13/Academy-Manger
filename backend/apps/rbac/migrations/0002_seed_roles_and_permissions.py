"""
Seed the five roles and the permission catalogue.

Idempotent, so it is safe to re-run and safe to extend: adding a permission to
apps/rbac/catalog.py and re-applying this migration on a fresh database gives
the same result as a deployment that has been running for a year.

It grants only what is missing and never revokes. Once live, the owner's
changes to a role are the authority - a later deploy must not quietly undo
them by re-imposing the seed matrix.
"""

from django.db import migrations

from apps.rbac.catalog import PERMISSIONS, ROLE_MATRIX, ROLE_NAMES


def seed(apps, schema_editor):
    Permission = apps.get_model("rbac", "Permission")
    Role = apps.get_model("rbac", "Role")
    RolePermission = apps.get_model("rbac", "RolePermission")

    permissions = {}
    for codename, (name, category) in PERMISSIONS.items():
        permission, _ = Permission.objects.update_or_create(
            codename=codename, defaults={"name": name, "category": category}
        )
        permissions[codename] = permission

    for code, granted in ROLE_MATRIX.items():
        role, _ = Role.objects.get_or_create(
            code=code, defaults={"name": ROLE_NAMES[code], "is_system": True}
        )
        existing = set(
            RolePermission.objects.filter(role=role).values_list(
                "permission__codename", flat=True
            )
        )
        RolePermission.objects.bulk_create(
            [
                RolePermission(role=role, permission=permissions[codename])
                for codename in granted
                if codename not in existing
            ]
        )


def unseed(apps, schema_editor):
    """
    Reverse for development only.

    Deletes the seeded grants and the system roles. On a live database this
    would strip every user of every permission, which is why it exists solely
    so `migrate rbac 0001` works locally.
    """
    Permission = apps.get_model("rbac", "Permission")
    Role = apps.get_model("rbac", "Role")

    Role.objects.filter(code__in=list(ROLE_MATRIX)).delete()
    Permission.objects.filter(codename__in=list(PERMISSIONS)).delete()


class Migration(migrations.Migration):
    dependencies = [("rbac", "0001_initial")]

    operations = [migrations.RunPython(seed, unseed)]
