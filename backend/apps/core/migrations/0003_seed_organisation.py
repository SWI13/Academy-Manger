"""
Create the organisation profile, so the first printed document has a header.

`Organisation.load()` would create the row on first access anyway, but a
report rendered a millisecond after a deploy should not be the thing that
creates it - and seeding here means the settings screen opens on a form with
the platform's own name already in it rather than an empty box.

The values are the ones the codebase already carried: the name in the root
layout's metadata and the tagline on the sign-in screen. Everything else is
blank, because guessing an institute's phone number is worse than leaving the
line off the page.
"""

from django.db import migrations

SINGLETON_PK = 1


def seed(apps, schema_editor):
    Organisation = apps.get_model("core", "Organisation")
    Organisation.objects.get_or_create(
        pk=SINGLETON_PK,
        defaults={
            "name": "SM Academy",
            "tagline": "Skills today, success tomorrow",
        },
    )


def unseed(apps, schema_editor):
    Organisation = apps.get_model("core", "Organisation")
    Organisation.objects.filter(pk=SINGLETON_PK).delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0002_organisation")]

    operations = [migrations.RunPython(seed, unseed)]
