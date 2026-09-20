"""
The universal print endpoint.

One property matters more than any other here, and it is the one the whole
feature could plausibly get wrong: **printing is never a way around a
permission.** A print button that fetched from a second, laxer endpoint would
be a hole with a friendly label on it.

So these tests are mostly the same assertion aimed at every printable
resource: the rows that come back are the rows the list would have returned,
scoped identically, and a caller who may not read the list may not print it.
"""

from datetime import date, timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone

from apps.courses.models import AssignmentStatus, Course, CourseProfessor, CourseStatus
from apps.enrollments.models import Enrollment
from apps.payments.models import Payment, PaymentStatus
from conftest import make_user

# Every printable resource in the platform, and the permission its list needs.
PRINTABLE = [
    "/api/v1/users/print/",
    "/api/v1/courses/print/",
    "/api/v1/enrollments/print/",
    "/api/v1/schedules/print/",
    "/api/v1/payments/print/",
    "/api/v1/attendance/sessions/print/",
    "/api/v1/attendance/records/print/",
    "/api/v1/logistics/items/print/",
    "/api/v1/logistics/expenses/print/",
]


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def course(db):
    return Course.objects.create(
        title="English B2",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 12, 30),
        price_minor=5_000_000,
        status=CourseStatus.ACTIVE,
    )


@pytest.fixture
def other_course(db):
    return Course.objects.create(
        title="Welding",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 12, 30),
        status=CourseStatus.ACTIVE,
    )


@pytest.fixture
def teacher(db, course):
    professor = make_user("PROFESSOR", phone="+213555200001")
    CourseProfessor.objects.create(
        course=course, professor=professor, status=AssignmentStatus.ACTIVE
    )
    return professor


@pytest.fixture
def two_classes(db, course, other_course):
    """One student on each course, so a scope either holds or visibly does not."""
    mine = make_user("STUDENT", phone="+213555200002")
    theirs = make_user("STUDENT", phone="+213555200003")
    return (
        Enrollment.objects.create(
            student=mine, course=course, price_at_enrollment_minor=5_000_000, currency="DZD"
        ),
        Enrollment.objects.create(
            student=theirs,
            course=other_course,
            price_at_enrollment_minor=5_000_000,
            currency="DZD",
        ),
    )


# ---------------------------------------------------------------------------
# The shape every printable endpoint answers in
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("path", PRINTABLE)
@pytest.mark.django_db
def test_every_printable_endpoint_answers_the_same_shape(logged_in, owner, path):
    response = logged_in(owner).get(path)
    assert response.status_code == 200, path
    for key in ("results", "printed_at"):
        assert key in response.data, f"{path} is missing {key}"


@pytest.mark.django_db
def test_printing_is_not_paginated(logged_in, owner, course):
    """A sheet that stops at the twenty-fifth row is worse than none: it looks complete."""
    for index in range(30):
        Course.objects.create(
            title=f"Course {index}",
            start_date=date(2026, 9, 1),
            end_date=date(2026, 12, 30),
            status=CourseStatus.ACTIVE,
        )

    listed = logged_in(owner).get("/api/v1/courses/")
    printed = logged_in(owner).get("/api/v1/courses/print/")

    assert listed.data["count"] == 31
    assert len(listed.data["results"]) == 25  # one page
    assert len(printed.data["results"]) == 31  # all of it
    assert printed.data["count"] == 31
    assert printed.data["truncated"] is False


# ---------------------------------------------------------------------------
# Printing is exactly as wide a door as reading. Never wider.
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_a_professor_cannot_print_what_they_cannot_read(logged_in, teacher):
    """A professor holds no payment permission, so neither list nor sheet."""
    client = logged_in(teacher)
    assert client.get("/api/v1/payments/").status_code == 403
    assert client.get("/api/v1/payments/print/").status_code == 403


@pytest.mark.django_db
def test_a_student_cannot_print_the_staff_list(logged_in, student):
    """`user.view` is scoped for a student - to themselves."""
    response = logged_in(student).get("/api/v1/users/print/")
    assert response.status_code == 200
    ids = {row["public_id"] for row in response.data["results"]}
    assert ids == {student.public_id}


@pytest.mark.django_db
def test_a_professor_prints_their_own_roster_and_nobody_elses(
    logged_in, teacher, two_classes, course
):
    mine, theirs = two_classes
    response = logged_in(teacher).get("/api/v1/enrollments/print/")

    assert response.status_code == 200
    printed = {row["id"] for row in response.data["results"]}
    assert mine.pk in printed
    assert theirs.pk not in printed


@pytest.mark.django_db
def test_a_student_prints_only_their_own_payments(logged_in, two_classes):
    mine, theirs = two_classes
    for enrolment in (mine, theirs):
        Payment.objects.create(
            enrollment=enrolment,
            amount_minor=100_000,
            paid_on=date(2026, 9, 10),
            method="CASH",
            status=PaymentStatus.APPROVED,
            approved_at=timezone.now(),
        )

    response = logged_in(mine.student).get("/api/v1/payments/print/")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["student_public_id"] == mine.student.public_id


@pytest.mark.parametrize("path", PRINTABLE)
@pytest.mark.django_db
def test_nothing_prints_without_a_session(api, path):
    assert api.get(path).status_code in (401, 403)


# ---------------------------------------------------------------------------
# The sheet is the screen's own selection
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_the_sheet_honours_the_same_filters_the_list_does(logged_in, owner, course, other_course):
    response = logged_in(owner).get(f"/api/v1/courses/print/?q={other_course.title}")
    assert response.data["count"] == 1
    assert response.data["results"][0]["public_id"] == other_course.public_id


@pytest.mark.django_db
def test_a_filtered_sheet_counts_only_what_it_shows(logged_in, owner, course, other_course):
    """ "Total: 63" on the paper has to be the rows above it."""
    filtered = logged_in(owner).get("/api/v1/courses/print/?status=ACTIVE")
    assert filtered.data["count"] == len(filtered.data["results"]) == 2

    Course.objects.create(
        title="Draft course",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 12, 30),
        status=CourseStatus.DRAFT,
    )
    still = logged_in(owner).get("/api/v1/courses/print/?status=ACTIVE")
    assert still.data["count"] == 2


@pytest.mark.django_db
def test_an_income_sheet_runs_the_way_the_period_ran(logged_in, owner, two_classes):
    """Ascending on paper, newest-first on screen. Same rows, opposite order."""
    mine, _ = two_classes
    for offset in (5, 1, 3):
        Payment.objects.create(
            enrollment=mine,
            amount_minor=100_000,
            paid_on=date(2026, 9, 1) + timedelta(days=offset),
            method="CASH",
            status=PaymentStatus.APPROVED,
            approved_at=timezone.now(),
        )

    client = logged_in(owner)
    printed = [row["paid_on"] for row in client.get("/api/v1/payments/print/").data["results"]]
    listed = [row["paid_on"] for row in client.get("/api/v1/payments/").data["results"]]

    assert printed == sorted(printed)
    assert listed == sorted(listed, reverse=True)
