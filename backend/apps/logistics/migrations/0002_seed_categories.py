"""
The categories the office starts with.

Rows, not code - so this is a starting point rather than the list. Every one
of them can be renamed, retired or joined by a new one through the setup
screen, which is the whole reason `Category` is a table.

Seeded because the alternative is a first-run experience where the inventory
form has an empty dropdown and nothing can be recorded until somebody works
out that categories live on another page. Idempotent, and it never touches a
row that already exists: an owner who renamed "TVs" to "Screens" keeps their
name if this is ever re-applied.

Locations are deliberately not seeded. "Room 1" is a guess about somebody
else's building; the categories above are the equipment every teaching
institute has.
"""

from django.db import migrations

ITEM_CATEGORIES = [
    "Chairs",
    "Tables",
    "Desks",
    "TVs",
    "PCs",
    "Laptops",
    "Projectors",
    "Whiteboards",
    "Printers",
    "Air conditioners",
    "Speakers",
    "Other equipment",
]

EXPENSE_CATEGORIES = [
    "Electricity",
    "Water",
    "Internet",
    "Maintenance",
    "Repairs",
    "Cleaning",
    "Equipment",
    "Furniture",
    "Rent",
    "Office supplies",
    "Transportation",
    "Other",
]


def seed(apps, schema_editor):
    Category = apps.get_model("logistics", "Category")

    for kind, names in (("ITEM", ITEM_CATEGORIES), ("EXPENSE", EXPENSE_CATEGORIES)):
        existing = set(Category.objects.filter(kind=kind).values_list("name", flat=True))
        Category.objects.bulk_create(
            [Category(kind=kind, name=name) for name in names if name not in existing]
        )


def unseed(apps, schema_editor):
    """
    Reverse for development only.

    Refuses to remove a category anything is filed under, because a PROTECT
    foreign key would refuse it anyway and failing here says why.
    """
    Category = apps.get_model("logistics", "Category")

    Category.objects.filter(kind="ITEM", name__in=ITEM_CATEGORIES, items__isnull=True).delete()
    Category.objects.filter(
        kind="EXPENSE", name__in=EXPENSE_CATEGORIES, expenses__isnull=True
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("logistics", "0001_initial")]

    operations = [migrations.RunPython(seed, unseed)]
