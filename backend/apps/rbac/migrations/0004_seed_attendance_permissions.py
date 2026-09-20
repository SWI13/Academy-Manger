"""
Re-apply the catalogue, now that it has the attendance permissions in it.

The third of these, and they all look the same on purpose: the catalogue is
the source of truth, a live database will never re-run an applied migration,
so growing the catalogue means one more migration that re-applies it.

Same two rules as its predecessors: grant only what is missing, and never
revoke. Once live, the owner's changes to a role are the authority.
"""

from django.db import migrations

from apps.rbac.catalog import PERMISSIONS, ROLE_MATRIX, ROLE_NAMES

ADDED = ["attendance.view", "attendance.record"]


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
            RolePermission.objects.filter(role=role).values_list("permission__codename", flat=True)
        )
        RolePermission.objects.bulk_create(
            [
                RolePermission(role=role, permission=permissions[codename])
                for codename in granted
                if codename not in existing
            ]
        )


def unseed(apps, schema_editor):
    """Reverse for development only: drop the two this migration introduced."""
    Permission = apps.get_model("rbac", "Permission")

    Permission.objects.filter(codename__in=ADDED).delete()


class Migration(migrations.Migration):
    dependencies = [("rbac", "0003_seed_logistics_permissions")]

    operations = [migrations.RunPython(seed, unseed)]
