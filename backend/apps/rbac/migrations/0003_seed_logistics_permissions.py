"""
Re-apply the catalogue, now that it has the logistics permissions in it.

Migration 0002 is idempotent and already ran; a database that has been live
for a year will never run it again, so a permission added to the catalogue
afterwards needs a migration of its own to reach that database. This is that
migration, and the next one to grow the catalogue will look exactly like it.

Deliberately self-contained rather than importing 0002's `seed`. A migration
that has already been applied everywhere is history, and history is not a
thing to reach into.

Same two rules as 0002: grant only what is missing, and never revoke. Once
live, the owner's changes to a role are the authority - a deploy must not
quietly undo them by re-imposing the seed matrix.
"""

from django.db import migrations

from apps.rbac.catalog import PERMISSIONS, ROLE_MATRIX, ROLE_NAMES

# What this migration is here for. Named explicitly so that reversing it takes
# out the logistics permissions and leaves the rest of the catalogue standing.
ADDED = ["logistics.view", "logistics.manage", "expense.view", "expense.manage"]


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
    """Reverse for development only: drop the four this migration introduced."""
    Permission = apps.get_model("rbac", "Permission")

    Permission.objects.filter(codename__in=ADDED).delete()


class Migration(migrations.Migration):
    dependencies = [("rbac", "0002_seed_roles_and_permissions")]

    operations = [migrations.RunPython(seed, unseed)]
