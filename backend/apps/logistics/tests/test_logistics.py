"""
Logistics: inventory and monthly expenses.

The property these tests exist to hold is the one the feature was asked for:
reception sees everything and changes nothing. That is a claim about the
*server*, not about which buttons render, so almost every test here is a
reception client issuing a request the interface would never offer and being
refused.

The rest is the arithmetic. Totals, breakdowns and month comparisons are
computed by `services.py` and asserted against rows here, because the moment
any of them is wrong the screens are confidently wrong rather than visibly
broken.
"""

from datetime import date

import pytest
from django.core.cache import cache

from apps.audit.models import AuditAction, AuditLog
from apps.logistics.models import Category, CategoryKind, Expense, Location, LogisticsItem

ITEMS = "/api/v1/logistics/items/"
EXPENSES = "/api/v1/logistics/expenses/"
CATEGORIES = "/api/v1/logistics/categories/"
LOCATIONS = "/api/v1/logistics/locations/"
OVERVIEW = "/api/v1/logistics/overview/"


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def chairs(db):
    return Category.objects.get(kind=CategoryKind.ITEM, name="Chairs")


@pytest.fixture
def electricity(db):
    return Category.objects.get(kind=CategoryKind.EXPENSE, name="Electricity")


@pytest.fixture
def room(db):
    return Location.objects.create(name="Room 3")


@pytest.fixture
def item(db, chairs, room):
    return LogisticsItem.objects.create(
        name="Plastic stacking chair", category=chairs, quantity=40, location=room
    )


def item_body(category, **overrides):
    return {
        "name": "Projector",
        "category": category.pk,
        "quantity": 2,
        "condition": "GOOD",
        "status": "AVAILABLE",
        **overrides,
    }


def expense_body(category, **overrides):
    return {
        "name": "Sonelgaz",
        "category": category.pk,
        "amount_minor": 12_000_00,
        "spent_on": "2026-03-04",
        "method": "CASH",
        **overrides,
    }


# ---------------------------------------------------------------------------
# The categories the migration seeds
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_the_office_starts_with_categories_to_file_things_under():
    """An empty dropdown on first run is a feature nobody can begin using."""
    assert Category.objects.filter(kind=CategoryKind.ITEM).exists()
    assert Category.objects.filter(kind=CategoryKind.EXPENSE).exists()


# ---------------------------------------------------------------------------
# Reception: everything visible, nothing writable
#
# The claim the whole module rests on. Each of these is a request the
# interface would never make, because hiding a button is not what enforces
# anything.
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_reception_reads_the_inventory(logged_in, reception, item):
    response = logged_in(reception).get(ITEMS)
    assert response.status_code == 200
    assert response.data["count"] == 1


@pytest.mark.django_db
def test_reception_reads_one_item(logged_in, reception, item):
    response = logged_in(reception).get(f"{ITEMS}{item.public_id}/")
    assert response.status_code == 200


@pytest.mark.django_db
def test_reception_reads_the_overview_and_the_expenses(logged_in, reception):
    client = logged_in(reception)
    assert client.get(OVERVIEW).status_code == 200
    assert client.get(EXPENSES).status_code == 200
    assert client.get(f"{EXPENSES}summary/").status_code == 200
    assert client.get(f"{EXPENSES}history/").status_code == 200


@pytest.mark.django_db
def test_reception_may_print_both_sheets(logged_in, reception, item):
    """Printing changes nothing, and the desk is who walks the list around."""
    client = logged_in(reception)
    assert client.get(f"{ITEMS}print/").status_code == 200
    assert client.get(f"{EXPENSES}print/").status_code == 200


@pytest.mark.django_db
def test_reception_cannot_add_an_item(logged_in, reception, chairs):
    response = logged_in(reception).post(ITEMS, item_body(chairs), format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_reception_cannot_edit_an_item(logged_in, reception, item):
    response = logged_in(reception).patch(
        f"{ITEMS}{item.public_id}/", {"quantity": 5}, format="json"
    )
    assert response.status_code == 403
    item.refresh_from_db()
    assert item.quantity == 40


@pytest.mark.django_db
def test_reception_cannot_delete_an_item(logged_in, reception, item):
    response = logged_in(reception).delete(f"{ITEMS}{item.public_id}/")
    assert response.status_code == 403
    assert LogisticsItem.objects.filter(pk=item.pk).exists()


@pytest.mark.django_db
def test_reception_cannot_record_or_change_an_expense(logged_in, reception, electricity):
    client = logged_in(reception)
    created = Expense.objects.create(
        name="Sonelgaz",
        category=electricity,
        amount_minor=1000,
        spent_on=date(2026, 3, 4),
        period_year=2026,
        period_month=3,
    )
    assert client.post(EXPENSES, expense_body(electricity), format="json").status_code == 403
    assert (
        client.patch(
            f"{EXPENSES}{created.public_id}/", {"amount_minor": 1}, format="json"
        ).status_code
        == 403
    )
    assert client.delete(f"{EXPENSES}{created.public_id}/").status_code == 403


@pytest.mark.django_db
def test_reception_cannot_invent_a_category_or_a_room(logged_in, reception):
    client = logged_in(reception)
    assert (
        client.post(CATEGORIES, {"kind": "ITEM", "name": "Drones"}, format="json").status_code
        == 403
    )
    assert client.post(LOCATIONS, {"name": "Basement"}, format="json").status_code == 403


@pytest.mark.django_db
def test_reception_can_still_read_the_categories_it_filters_by(logged_in, reception):
    """The dropdowns have to be fillable, or the filters are decoration."""
    response = logged_in(reception).get(f"{CATEGORIES}?kind=ITEM")
    assert response.status_code == 200
    assert response.data["count"] > 0


# ---------------------------------------------------------------------------
# Everybody else
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("role", ["professor", "student"])
@pytest.mark.django_db
def test_teaching_roles_hold_no_logistics_permission(request, logged_in, role, item):
    """A professor sees who is in the room, not what the room is worth."""
    client = logged_in(request.getfixturevalue(role))
    assert client.get(ITEMS).status_code == 403
    assert client.get(EXPENSES).status_code == 403
    assert client.get(OVERVIEW).status_code == 403


@pytest.mark.django_db
def test_an_anonymous_caller_reaches_nothing(api, item):
    assert api.get(ITEMS).status_code in (401, 403)


@pytest.mark.parametrize("role", ["owner", "admin"])
@pytest.mark.django_db
def test_owner_and_admin_have_the_full_run_of_it(request, logged_in, role, chairs):
    client = logged_in(request.getfixturevalue(role))

    created = client.post(ITEMS, item_body(chairs), format="json")
    assert created.status_code == 201, created.data
    public_id = created.data["public_id"]

    edited = client.patch(f"{ITEMS}{public_id}/", {"quantity": 9}, format="json")
    assert edited.status_code == 200
    assert edited.data["quantity"] == 9

    assert client.delete(f"{ITEMS}{public_id}/").status_code == 204


# ---------------------------------------------------------------------------
# Data integrity
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_a_negative_quantity_is_refused(logged_in, admin, chairs):
    response = logged_in(admin).post(ITEMS, item_body(chairs, quantity=-1), format="json")
    assert response.status_code == 400
    assert "quantity" in response.data["error"]["details"]


@pytest.mark.django_db
def test_a_negative_expense_is_refused(logged_in, admin, electricity):
    response = logged_in(admin).post(
        EXPENSES, expense_body(electricity, amount_minor=-500), format="json"
    )
    assert response.status_code == 400
    assert "amount_minor" in response.data["error"]["details"]


@pytest.mark.django_db
def test_a_nameless_item_is_refused(logged_in, admin, chairs):
    response = logged_in(admin).post(ITEMS, item_body(chairs, name="   "), format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_two_machines_cannot_share_a_serial_number(logged_in, admin, chairs):
    """An inventory that counts one laptop twice is worse than one nobody wrote."""
    client = logged_in(admin)
    first = client.post(ITEMS, item_body(chairs, serial_number="SN-1"), format="json")
    assert first.status_code == 201

    second = client.post(ITEMS, item_body(chairs, serial_number="sn-1"), format="json")
    assert second.status_code == 400
    assert "serial_number" in second.data["error"]["details"]


@pytest.mark.django_db
def test_blank_serial_numbers_do_not_collide(logged_in, admin, chairs):
    """Forty chairs share the absence of a serial number, and that is fine."""
    client = logged_in(admin)
    assert client.post(ITEMS, item_body(chairs), format="json").status_code == 201
    assert client.post(ITEMS, item_body(chairs), format="json").status_code == 201


@pytest.mark.django_db
def test_editing_an_item_keeps_its_own_serial_number(logged_in, admin, chairs):
    """The uniqueness check must not find the row it is checking."""
    client = logged_in(admin)
    created = client.post(ITEMS, item_body(chairs, serial_number="SN-9"), format="json")
    response = client.patch(
        f"{ITEMS}{created.data['public_id']}/",
        {"serial_number": "SN-9", "quantity": 3},
        format="json",
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_an_expense_category_is_refused_for_an_item(logged_in, admin, electricity):
    response = logged_in(admin).post(ITEMS, item_body(electricity), format="json")
    assert response.status_code == 400
    assert "category" in response.data["error"]["details"]


@pytest.mark.django_db
def test_an_item_category_is_refused_for_an_expense(logged_in, admin, chairs):
    response = logged_in(admin).post(EXPENSES, expense_body(chairs), format="json")
    assert response.status_code == 400
    assert "category" in response.data["error"]["details"]


# ---------------------------------------------------------------------------
# Deletion is soft, and recorded
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_deleting_an_item_hides_it_without_destroying_it(logged_in, admin, item):
    client = logged_in(admin)
    assert client.delete(f"{ITEMS}{item.public_id}/").status_code == 204

    assert client.get(ITEMS).data["count"] == 0
    assert client.get(f"{ITEMS}{item.public_id}/").status_code == 404

    item.refresh_from_db()
    assert item.deleted_at is not None
    assert item.deleted_by_id is not None


@pytest.mark.django_db
def test_a_deleted_item_leaves_the_totals(logged_in, admin, item):
    client = logged_in(admin)
    assert client.get(OVERVIEW).data["units_total"] == 40
    client.delete(f"{ITEMS}{item.public_id}/")
    assert client.get(OVERVIEW).data["units_total"] == 0


@pytest.mark.django_db
def test_the_audit_log_records_who_removed_what(logged_in, admin, item):
    logged_in(admin).delete(f"{ITEMS}{item.public_id}/")
    entry = AuditLog.objects.filter(action=AuditAction.LOGISTICS_ITEM_DELETED).first()
    assert entry is not None
    assert entry.actor_public_id == admin.public_id
    assert entry.object_id == item.public_id


@pytest.mark.django_db
def test_creating_and_editing_are_recorded_too(logged_in, admin, chairs):
    client = logged_in(admin)
    created = client.post(ITEMS, item_body(chairs), format="json")
    client.patch(f"{ITEMS}{created.data['public_id']}/", {"quantity": 7}, format="json")

    assert AuditLog.objects.filter(action=AuditAction.LOGISTICS_ITEM_CREATED).exists()
    edit = AuditLog.objects.filter(action=AuditAction.LOGISTICS_ITEM_UPDATED).first()
    assert edit is not None
    # Only what moved, not every field on the row.
    assert edit.old_values == {"quantity": 2}
    assert edit.new_values == {"quantity": 7}


@pytest.mark.django_db
def test_an_edit_that_changes_nothing_writes_no_audit_row(logged_in, admin, item):
    logged_in(admin).patch(f"{ITEMS}{item.public_id}/", {"quantity": 40}, format="json")
    assert not AuditLog.objects.filter(action=AuditAction.LOGISTICS_ITEM_UPDATED).exists()


# ---------------------------------------------------------------------------
# The accounting month
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_the_period_follows_the_date_when_nobody_says_otherwise(logged_in, admin, electricity):
    response = logged_in(admin).post(EXPENSES, expense_body(electricity), format="json")
    assert response.status_code == 201, response.data
    assert (response.data["period_year"], response.data["period_month"]) == (2026, 3)


@pytest.mark.django_db
def test_februarys_bill_paid_in_march_can_be_filed_in_february(logged_in, admin, electricity):
    """The reason the month is a field and not a consequence of the date."""
    response = logged_in(admin).post(
        EXPENSES,
        expense_body(electricity, period_year=2026, period_month=2),
        format="json",
    )
    assert response.status_code == 201
    assert response.data["period_month"] == 2
    assert response.data["spent_on"] == "2026-03-04"


@pytest.mark.django_db
def test_moving_the_date_moves_the_accounting_month_with_it(logged_in, admin, electricity):
    """Otherwise a corrected date leaves the row filed under the old month."""
    client = logged_in(admin)
    created = client.post(EXPENSES, expense_body(electricity), format="json")

    moved = client.patch(
        f"{EXPENSES}{created.data['public_id']}/",
        {"spent_on": "2026-05-11"},
        format="json",
    )
    assert moved.status_code == 200
    assert (moved.data["period_year"], moved.data["period_month"]) == (2026, 5)


@pytest.mark.django_db
def test_an_impossible_month_is_refused(logged_in, admin, electricity):
    response = logged_in(admin).post(
        EXPENSES, expense_body(electricity, period_month=13), format="json"
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# The figures
# ---------------------------------------------------------------------------
@pytest.fixture
def a_month_of_spending(db, electricity):
    other = Category.objects.get(kind=CategoryKind.EXPENSE, name="Cleaning")
    for name, category, amount, month in (
        ("Sonelgaz", electricity, 60_000_00, 3),
        ("Sonelgaz", electricity, 20_000_00, 3),
        ("Cleaner", other, 30_000_00, 3),
        ("Sonelgaz", electricity, 50_000_00, 2),
    ):
        Expense.objects.create(
            name=name,
            category=category,
            amount_minor=amount,
            spent_on=date(2026, month, 4),
            period_year=2026,
            period_month=month,
        )


@pytest.mark.django_db
def test_the_month_total_is_the_sum_of_its_rows(logged_in, admin, a_month_of_spending):
    summary = logged_in(admin).get(f"{EXPENSES}summary/?year=2026&month=3").data
    assert summary["month_total_minor"] == 110_000_00
    assert summary["month_count"] == 3


@pytest.mark.django_db
def test_the_comparison_is_signed_against_the_month_before(logged_in, admin, a_month_of_spending):
    summary = logged_in(admin).get(f"{EXPENSES}summary/?year=2026&month=3").data
    assert summary["previous_total_minor"] == 50_000_00
    assert summary["change_minor"] == 60_000_00

    february = logged_in(admin).get(f"{EXPENSES}summary/?year=2026&month=2").data
    # January had nothing, so February is entirely an increase on it.
    assert february["change_minor"] == 50_000_00


@pytest.mark.django_db
def test_december_compares_against_the_previous_year(logged_in, admin, electricity):
    Expense.objects.create(
        name="Sonelgaz",
        category=electricity,
        amount_minor=1000,
        spent_on=date(2025, 12, 1),
        period_year=2025,
        period_month=12,
    )
    summary = logged_in(admin).get(f"{EXPENSES}summary/?year=2026&month=1").data
    assert (summary["previous_year"], summary["previous_month"]) == (2025, 12)
    assert summary["previous_total_minor"] == 1000


@pytest.mark.django_db
def test_the_breakdown_is_heaviest_category_first(logged_in, admin, a_month_of_spending):
    summary = logged_in(admin).get(f"{EXPENSES}summary/?year=2026&month=3").data
    labels = [row["label"] for row in summary["by_category"]]
    assert labels == ["Electricity", "Cleaning"]
    assert summary["by_category"][0]["total_minor"] == 80_000_00


@pytest.mark.django_db
def test_the_year_strip_has_twelve_months_including_the_empty_ones(
    logged_in, admin, a_month_of_spending
):
    """A strip missing January reads as a year that started in February."""
    summary = logged_in(admin).get(f"{EXPENSES}summary/?year=2026&month=3").data
    assert [row["month"] for row in summary["monthly"]] == list(range(1, 13))
    assert summary["monthly"][0]["total_minor"] == 0


@pytest.mark.django_db
def test_the_year_total_covers_the_whole_year(logged_in, admin, a_month_of_spending):
    summary = logged_in(admin).get(f"{EXPENSES}summary/?year=2026&month=3").data
    assert summary["year_total_minor"] == 160_000_00


@pytest.mark.django_db
def test_the_history_names_each_months_heaviest_category(logged_in, admin, a_month_of_spending):
    rows = logged_in(admin).get(f"{EXPENSES}history/").data["results"]
    assert [(row["year"], row["month"]) for row in rows] == [(2026, 3), (2026, 2)]
    assert rows[0]["total_minor"] == 110_000_00
    assert rows[0]["top_category"] == "Electricity"


@pytest.mark.django_db
def test_the_history_leaves_out_months_with_nothing_in_them(logged_in, admin, a_month_of_spending):
    rows = logged_in(admin).get(f"{EXPENSES}history/").data["results"]
    assert all(row["count"] > 0 for row in rows)


@pytest.mark.django_db
def test_a_deleted_expense_leaves_the_month_total(logged_in, admin, a_month_of_spending):
    client = logged_in(admin)
    victim = Expense.objects.filter(period_month=3, amount_minor=60_000_00).first()
    client.delete(f"{EXPENSES}{victim.public_id}/")
    summary = client.get(f"{EXPENSES}summary/?year=2026&month=3").data
    assert summary["month_total_minor"] == 50_000_00


# ---------------------------------------------------------------------------
# The inventory overview
# ---------------------------------------------------------------------------
@pytest.fixture
def a_room_of_things(db, chairs, room):
    tables = Category.objects.get(kind=CategoryKind.ITEM, name="Tables")
    LogisticsItem.objects.create(name="Chair", category=chairs, quantity=40, location=room)
    LogisticsItem.objects.create(
        name="Broken chair", category=chairs, quantity=3, condition="DAMAGED"
    )
    LogisticsItem.objects.create(
        name="Table", category=tables, quantity=10, condition="NEEDS_REPAIR", status="IN_USE"
    )
    LogisticsItem.objects.create(name="Lost table", category=tables, quantity=1, status="MISSING")


@pytest.mark.django_db
def test_the_overview_counts_lines_and_units_separately(logged_in, admin, a_room_of_things):
    """ "12 items needing repair" and "12 chairs needing repair" are different sentences."""
    overview = logged_in(admin).get(OVERVIEW).data
    assert overview["items_total"] == 4
    assert overview["units_total"] == 54
    assert overview["damaged_items"] == 1
    assert overview["damaged_units"] == 3
    assert overview["needs_repair_units"] == 10
    assert overview["missing_units"] == 1


@pytest.mark.django_db
def test_the_category_breakdown_is_built_from_the_rows(logged_in, admin, a_room_of_things):
    """Where "total chairs, total tables, total TVs" comes from, without a deploy."""
    overview = logged_in(admin).get(OVERVIEW).data
    by_name = {row["label"]: row for row in overview["by_category"]}
    assert by_name["Chairs"]["units"] == 43
    assert by_name["Chairs"]["items"] == 2
    assert by_name["Tables"]["units"] == 11


@pytest.mark.django_db
def test_every_condition_appears_even_when_nothing_is_in_it(logged_in, admin, a_room_of_things):
    """A breakdown that omits "Damaged" reads as one that forgot to look."""
    overview = logged_in(admin).get(OVERVIEW).data
    assert [row["key"] for row in overview["by_condition"]] == [
        "NEW",
        "GOOD",
        "NEEDS_REPAIR",
        "DAMAGED",
    ]


@pytest.mark.django_db
def test_the_overview_carries_what_was_added_most_recently(logged_in, admin, a_room_of_things):
    overview = logged_in(admin).get(OVERVIEW).data
    assert len(overview["recent"]) == 4
    assert overview["recent"][0]["name"] == "Lost table"


# ---------------------------------------------------------------------------
# Filters, and the printed sheet
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_the_list_filters_by_room_condition_and_search(logged_in, admin, a_room_of_things, room):
    client = logged_in(admin)
    assert client.get(f"{ITEMS}?location={room.pk}").data["count"] == 1
    assert client.get(f"{ITEMS}?condition=DAMAGED").data["count"] == 1
    assert client.get(f"{ITEMS}?status=MISSING").data["count"] == 1
    assert client.get(f"{ITEMS}?q=broken").data["count"] == 1


@pytest.mark.django_db
def test_the_list_sorts_by_quantity(logged_in, admin, a_room_of_things):
    rows = logged_in(admin).get(f"{ITEMS}?ordering=-quantity").data["results"]
    assert [row["quantity"] for row in rows] == [40, 10, 3, 1]


@pytest.mark.django_db
def test_the_printed_sheet_is_not_paginated(logged_in, admin, chairs):
    """A printed inventory that stops at row 25 is worse than none: it looks complete."""
    client = logged_in(admin)
    LogisticsItem.objects.bulk_create(
        [
            LogisticsItem(
                name=f"Chair {index}",
                category=chairs,
                quantity=1,
                public_id=f"LOG-{index:06d}",
            )
            for index in range(1, 31)
        ]
    )

    response = client.get(f"{ITEMS}print/")
    assert response.status_code == 200
    assert len(response.data["results"]) == 30
    assert response.data["overview"]["items_total"] == 30


@pytest.mark.django_db
def test_the_printed_totals_describe_the_filtered_selection(
    logged_in, admin, a_room_of_things, room
):
    """ "Total items: 63" must be the rows above it, not a set the reader cannot see."""
    response = logged_in(admin).get(f"{ITEMS}print/?location={room.pk}")
    assert len(response.data["results"]) == 1
    assert response.data["overview"]["units_total"] == 40


@pytest.mark.django_db
def test_the_printed_month_carries_its_own_total(logged_in, admin, a_month_of_spending):
    response = logged_in(admin).get(f"{EXPENSES}print/?year=2026&month=3")
    assert len(response.data["results"]) == 3
    assert response.data["summary"]["month_total_minor"] == 110_000_00
    # Ascending on paper: a ledger runs the way the month ran.
    dates = [row["spent_on"] for row in response.data["results"]]
    assert dates == sorted(dates)


# ---------------------------------------------------------------------------
# Categories are rows, which is the point of them
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_an_owner_adds_a_kind_of_equipment_nobody_wrote_code_for(logged_in, owner):
    client = logged_in(owner)
    created = client.post(CATEGORIES, {"kind": "ITEM", "name": "3D printers"}, format="json")
    assert created.status_code == 201

    filed = client.post(
        ITEMS,
        {
            "name": "Prusa MK4",
            "category": created.data["id"],
            "quantity": 1,
            "condition": "NEW",
            "status": "AVAILABLE",
        },
        format="json",
    )
    assert filed.status_code == 201
    assert filed.data["category_name"] == "3D printers"


@pytest.mark.django_db
def test_a_category_is_retired_rather_than_deleted(logged_in, admin, chairs, item):
    """Deleting one would orphan every row filed under it, or take them with it."""
    client = logged_in(admin)
    assert client.delete(f"{CATEGORIES}{chairs.pk}/").status_code == 405

    retired = client.patch(f"{CATEGORIES}{chairs.pk}/", {"is_active": False}, format="json")
    assert retired.status_code == 200

    # Gone from the dropdowns, and the item that used it still says "Chairs".
    active = client.get(f"{CATEGORIES}?kind=ITEM&active=true").data["results"]
    assert chairs.pk not in [row["id"] for row in active]
    assert client.get(f"{ITEMS}{item.public_id}/").data["category_name"] == "Chairs"


@pytest.mark.django_db
def test_a_category_says_how_much_is_filed_under_it(logged_in, admin, chairs, item):
    """Retiring an empty label is nothing; retiring one with ninety items is a decision."""
    rows = logged_in(admin).get(f"{CATEGORIES}?kind=ITEM").data["results"]
    chairs_row = next(row for row in rows if row["id"] == chairs.pk)
    assert chairs_row["usage_count"] == 1


@pytest.mark.django_db
def test_a_deleted_item_stops_counting_towards_its_category(logged_in, admin, chairs, item):
    client = logged_in(admin)
    client.delete(f"{ITEMS}{item.public_id}/")
    rows = client.get(f"{CATEGORIES}?kind=ITEM").data["results"]
    chairs_row = next(row for row in rows if row["id"] == chairs.pk)
    assert chairs_row["usage_count"] == 0


@pytest.mark.django_db
def test_two_categories_of_the_same_kind_cannot_share_a_name(logged_in, admin):
    client = logged_in(admin)
    client.post(CATEGORIES, {"kind": "ITEM", "name": "Drones"}, format="json")
    again = client.post(CATEGORIES, {"kind": "ITEM", "name": "Drones"}, format="json")
    assert again.status_code == 400
