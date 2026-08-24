"""
Identifier allocation.

The concurrency test is the reason this module exists. Two receptionists
creating a student at the same moment must not receive the same STU number,
and that property is only observable with real threads against a real
PostgreSQL row lock - which is why the suite does not run on SQLite.
"""

import threading

import pytest
from django.db import connection

from apps.core.identifiers import (
    next_course_identifier,
    next_identifier,
    next_user_identifier,
)
from apps.core.models import IdentifierSequence


@pytest.mark.django_db
def test_first_identifier_starts_at_one():
    assert next_identifier("STU") == "STU-000001"


@pytest.mark.django_db
def test_identifiers_increment_in_order():
    got = [next_identifier("STU") for _ in range(3)]
    assert got == ["STU-000001", "STU-000002", "STU-000003"]


@pytest.mark.django_db
def test_separate_keys_have_separate_counters():
    assert next_identifier("STU") == "STU-000001"
    assert next_identifier("PROF") == "PROF-000001"
    assert next_identifier("STU") == "STU-000002"


@pytest.mark.django_db
def test_width_controls_zero_padding():
    assert next_identifier("C-2026", width=3) == "C-2026-001"


@pytest.mark.django_db
def test_course_identifier_is_year_scoped():
    assert next_course_identifier(2026) == "C-2026-001"
    assert next_course_identifier(2026) == "C-2026-002"
    # A new year restarts numbering rather than continuing from last year.
    assert next_course_identifier(2027) == "C-2027-001"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("role", "expected"),
    [
        ("STUDENT", "STU-000001"),
        ("PROFESSOR", "PROF-000001"),
        ("RECEPTION", "REC-000001"),
        ("ADMIN", "ADMIN-000001"),
        ("OWNER", "OWN-000001"),
    ],
)
def test_user_identifier_prefix_per_role(role, expected):
    assert next_user_identifier(role) == expected


@pytest.mark.django_db
def test_unknown_role_is_rejected_rather_than_guessed():
    with pytest.raises(ValueError, match="No identifier prefix"):
        next_user_identifier("JANITOR")


@pytest.mark.django_db
def test_counter_row_is_created_once_not_per_call():
    next_identifier("STU")
    next_identifier("STU")
    assert IdentifierSequence.objects.filter(key="STU").count() == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_allocation_never_duplicates():
    """Twenty threads racing for a student number must get twenty distinct numbers."""
    thread_count = 20
    results: list[str] = []
    errors: list[Exception] = []
    guard = threading.Lock()
    start = threading.Barrier(thread_count)

    def allocate() -> None:
        try:
            start.wait(timeout=10)  # maximise the overlap
            value = next_identifier("STU")
            with guard:
                results.append(value)
        except Exception as exc:  # noqa: BLE001 - recorded and asserted below
            with guard:
                errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=allocate) for _ in range(thread_count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert errors == []
    assert len(results) == thread_count
    assert len(set(results)) == thread_count, "duplicate identifier issued"
    assert sorted(results) == [f"STU-{n:06d}" for n in range(1, thread_count + 1)]
