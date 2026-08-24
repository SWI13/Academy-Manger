"""
Reviews and moderation.

Three properties carry the weight here. Only someone who finished the course
may review it. A moderator's decision is recorded and reversible but the row
never disappears. And a professor can read what was said about their teaching
without learning which of their current students said it.
"""

from datetime import date

import pytest
from django.core.cache import cache

from apps.audit.models import AuditAction, AuditLog
from apps.courses.models import (
    AssignmentStatus,
    Course,
    CourseProfessor,
    CourseStatus,
)
from apps.enrollments.models import Enrollment, EnrollmentStatus
from apps.reviews.models import Review, ReviewStatus
from conftest import make_user

REVIEWS = "/api/v1/reviews/"


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def course(db):
    return Course.objects.create(
        title="English B2",
        start_date=date(2026, 1, 6),
        end_date=date(2026, 5, 29),
        price_minor=5_000_000,
        status=CourseStatus.ACTIVE,
    )


@pytest.fixture
def taught(db, course, professor):
    CourseProfessor.objects.create(
        course=course, professor=professor, status=AssignmentStatus.ACTIVE
    )
    return course


@pytest.fixture
def completed(db, course, student):
    return Enrollment.objects.create(
        student=student,
        course=course,
        price_at_enrollment_minor=course.price_minor,
        status=EnrollmentStatus.COMPLETED,
    )


@pytest.fixture
def enrol(db, course):
    """Complete an enrolment for any user, without pulling in the `student` fixture."""

    def _enrol(user, status=EnrollmentStatus.COMPLETED):
        return Enrollment.objects.create(
            student=user,
            course=course,
            price_at_enrollment_minor=course.price_minor,
            status=status,
        )

    return _enrol


@pytest.fixture
def active(db, course, student):
    return Enrollment.objects.create(
        student=student,
        course=course,
        price_at_enrollment_minor=course.price_minor,
        status=EnrollmentStatus.ACTIVE,
    )


def write(client, enrollment, **overrides):
    body = {
        "enrollment_id": enrollment.pk,
        "rating": 5,
        "comment": "Clear and patient.",
        **overrides,
    }
    return client.post(REVIEWS, body, format="json")


def approved_review(enrollment, **overrides):
    from django.utils import timezone

    return Review.objects.create(
        enrollment=enrollment,
        rating=overrides.pop("rating", 4),
        comment=overrides.pop("comment", "Good course."),
        status=ReviewStatus.APPROVED,
        moderated_at=timezone.now(),
        **overrides,
    )


# --- writing ----------------------------------------------------------------


@pytest.mark.django_db
def test_student_reviews_a_completed_course(logged_in, student, completed):
    response = write(logged_in(student), completed)

    assert response.status_code == 201, response.data
    assert response.data["status"] == ReviewStatus.PENDING
    assert response.data["course_public_id"] == completed.course.public_id


@pytest.mark.django_db
def test_a_review_starts_pending_whatever_the_client_sends(logged_in, student, completed):
    response = write(logged_in(student), completed, status=ReviewStatus.APPROVED)

    assert response.status_code == 201
    # `status` is not a writable field. A client that sends it publishes
    # nothing - moderation is the only route to APPROVED.
    assert Review.objects.get().status == ReviewStatus.PENDING


@pytest.mark.django_db
def test_an_unfinished_course_cannot_be_reviewed_yet(logged_in, student, active):
    response = write(logged_in(student), active)

    assert response.status_code == 409
    assert response.data["error"]["code"] == "review_not_allowed"
    assert not Review.objects.exists()


@pytest.mark.django_db
def test_one_review_per_enrolment(logged_in, student, completed):
    client = logged_in(student)
    assert write(client, completed).status_code == 201

    second = write(client, completed, rating=1)

    assert second.status_code == 409
    assert Review.objects.count() == 1


@pytest.mark.django_db
def test_a_student_cannot_review_someone_elses_enrolment(logged_in, completed):
    other = make_user("STUDENT", phone="+213555000201")

    response = write(logged_in(other), completed)

    # Not "that is not yours" - the enrolment is simply not there for them.
    assert response.status_code == 400
    assert "enrollment_id" in response.data["error"]["details"]
    assert not Review.objects.exists()


@pytest.mark.django_db
@pytest.mark.parametrize("rating", [0, 6, -1])
def test_rating_must_be_one_to_five(logged_in, student, completed, rating):
    response = write(logged_in(student), completed, rating=rating)

    assert response.status_code == 400
    assert not Review.objects.exists()


@pytest.mark.django_db
def test_staff_cannot_write_reviews(logged_in, all_roles, enrol):
    enrollment = enrol(all_roles["STUDENT"])

    for code in ("OWNER", "ADMIN", "RECEPTION", "PROFESSOR"):
        response = write(logged_in(all_roles[code]), enrollment)
        assert response.status_code == 403, f"{code} wrote a review"

    assert not Review.objects.exists()


# --- editing ----------------------------------------------------------------


@pytest.mark.django_db
def test_a_student_may_correct_a_pending_review(logged_in, student, completed):
    client = logged_in(student)
    created = write(client, completed).data

    response = client.patch(
        f"{REVIEWS}{created['id']}/", {"rating": 3, "comment": "On reflection."}, format="json"
    )

    assert response.status_code == 200, response.data
    assert response.data["rating"] == 3


@pytest.mark.django_db
def test_a_moderated_review_is_frozen(logged_in, student, completed, owner):
    client = logged_in(student)
    created = write(client, completed).data
    logged_in(owner).post(
        f"{REVIEWS}{created['id']}/moderate/", {"status": ReviewStatus.APPROVED}, format="json"
    )

    response = client.patch(f"{REVIEWS}{created['id']}/", {"rating": 1}, format="json")

    assert response.status_code == 409
    assert Review.objects.get().rating == 5


@pytest.mark.django_db
def test_nobody_deletes_a_review(logged_in, owner, completed):
    review = approved_review(completed)

    response = logged_in(owner).delete(f"{REVIEWS}{review.pk}/")

    # 405, not 403. The operation does not exist for anyone, which is a
    # different statement from "your role may not".
    assert response.status_code == 405
    assert Review.objects.filter(pk=review.pk).exists()


# --- moderation -------------------------------------------------------------


@pytest.mark.django_db
def test_owner_approves_a_review_and_it_is_recorded(logged_in, owner, student, completed):
    review = Review.objects.create(enrollment=completed, rating=5, comment="Excellent.")

    response = logged_in(owner).post(
        f"{REVIEWS}{review.pk}/moderate/",
        {"status": ReviewStatus.APPROVED, "admin_response": "Thank you."},
        format="json",
    )

    assert response.status_code == 200, response.data
    review.refresh_from_db()
    assert review.status == ReviewStatus.APPROVED
    assert review.moderated_by == owner
    assert review.moderated_at is not None
    assert AuditLog.objects.filter(
        action=AuditAction.REVIEW_MODERATED, actor_public_id=owner.public_id
    ).exists()


@pytest.mark.django_db
def test_hiding_keeps_the_row_and_the_decision(logged_in, admin, completed):
    review = approved_review(completed)

    response = logged_in(admin).post(
        f"{REVIEWS}{review.pk}/moderate/", {"status": ReviewStatus.HIDDEN}, format="json"
    )

    assert response.status_code == 200
    review.refresh_from_db()
    assert review.status == ReviewStatus.HIDDEN
    assert review.moderated_by == admin


@pytest.mark.django_db
def test_a_review_cannot_be_pushed_back_to_pending(logged_in, owner, completed):
    review = approved_review(completed)

    response = logged_in(owner).post(
        f"{REVIEWS}{review.pk}/moderate/", {"status": ReviewStatus.PENDING}, format="json"
    )

    assert response.status_code == 400
    assert Review.objects.get().status == ReviewStatus.APPROVED


@pytest.mark.django_db
def test_reception_and_professors_cannot_moderate(logged_in, all_roles, enrol):
    review = Review.objects.create(
        enrollment=enrol(all_roles["STUDENT"]), rating=2, comment="Room was cold."
    )

    for code in ("RECEPTION", "PROFESSOR", "STUDENT"):
        response = logged_in(all_roles[code]).post(
            f"{REVIEWS}{review.pk}/moderate/", {"status": ReviewStatus.HIDDEN}, format="json"
        )
        assert response.status_code in (403, 404), f"{code} moderated a review"

    assert Review.objects.get().status == ReviewStatus.PENDING


# --- who sees what ----------------------------------------------------------


@pytest.mark.django_db
def test_a_student_sees_their_own_review_in_any_state(logged_in, student, completed):
    Review.objects.create(enrollment=completed, rating=1, comment="Not for me.")

    response = logged_in(student).get(REVIEWS)

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["status"] == ReviewStatus.PENDING


@pytest.mark.django_db
def test_a_student_does_not_see_another_students_pending_review(logged_in, course, student):
    classmate = make_user("STUDENT", phone="+213555000202")
    theirs = Enrollment.objects.create(
        student=classmate,
        course=course,
        price_at_enrollment_minor=course.price_minor,
        status=EnrollmentStatus.COMPLETED,
    )
    Enrollment.objects.create(
        student=student,
        course=course,
        price_at_enrollment_minor=course.price_minor,
        status=EnrollmentStatus.COMPLETED,
    )
    pending = Review.objects.create(enrollment=theirs, rating=1, comment="Unhappy.")

    listed = logged_in(student).get(REVIEWS)
    fetched = logged_in(student).get(f"{REVIEWS}{pending.pk}/")

    assert listed.data["count"] == 0
    assert fetched.status_code == 404


@pytest.mark.django_db
def test_a_professor_reads_approved_reviews_without_the_author(
    logged_in, professor, taught, student
):
    enrollment = Enrollment.objects.create(
        student=student,
        course=taught,
        price_at_enrollment_minor=taught.price_minor,
        status=EnrollmentStatus.COMPLETED,
    )
    approved_review(enrollment, rating=2, comment="Went too fast.")

    response = logged_in(professor).get(REVIEWS)

    assert response.data["count"] == 1
    row = response.data["results"][0]
    assert row["comment"] == "Went too fast."
    # The professor enters this student's marks. Knowing who wrote a two-star
    # review would make the feedback channel unusable, so the identity is not
    # in the payload at all - not blanked, absent.
    assert "student_public_id" not in row
    assert "student_name" not in row


@pytest.mark.django_db
def test_a_professor_never_sees_a_pending_review(logged_in, professor, taught, student):
    enrollment = Enrollment.objects.create(
        student=student,
        course=taught,
        price_at_enrollment_minor=taught.price_minor,
        status=EnrollmentStatus.COMPLETED,
    )
    pending = Review.objects.create(enrollment=enrollment, rating=1, comment="Complaint.")

    listed = logged_in(professor).get(REVIEWS)
    fetched = logged_in(professor).get(f"{REVIEWS}{pending.pk}/")

    assert listed.data["count"] == 0
    assert fetched.status_code == 404


@pytest.mark.django_db
def test_a_professor_cannot_read_another_professors_reviews(logged_in, professor, course, student):
    other_professor = make_user("PROFESSOR", phone="+213555000203")
    CourseProfessor.objects.create(
        course=course, professor=other_professor, status=AssignmentStatus.ACTIVE
    )
    enrollment = Enrollment.objects.create(
        student=student,
        course=course,
        price_at_enrollment_minor=course.price_minor,
        status=EnrollmentStatus.COMPLETED,
    )
    review = approved_review(enrollment)

    response = logged_in(professor).get(f"{REVIEWS}{review.pk}/")

    assert response.status_code == 404


@pytest.mark.django_db
def test_owner_sees_pending_reviews(logged_in, owner, completed):
    Review.objects.create(enrollment=completed, rating=3, comment="Fine.")

    response = logged_in(owner).get(f"{REVIEWS}?status=PENDING")

    assert response.data["count"] == 1
    assert response.data["results"][0]["student_public_id"] == completed.student.public_id


# --- the aggregate ----------------------------------------------------------


@pytest.mark.django_db
def test_summary_averages_approved_reviews_only(logged_in, owner, course, student):
    classmate = make_user("STUDENT", phone="+213555000204")
    first = Enrollment.objects.create(
        student=student,
        course=course,
        price_at_enrollment_minor=course.price_minor,
        status=EnrollmentStatus.COMPLETED,
    )
    second = Enrollment.objects.create(
        student=classmate,
        course=course,
        price_at_enrollment_minor=course.price_minor,
        status=EnrollmentStatus.COMPLETED,
    )
    approved_review(first, rating=4)
    approved_review(second, rating=2)
    # A pending one-star must not move the published average.
    third = make_user("STUDENT", phone="+213555000205")
    Review.objects.create(
        enrollment=Enrollment.objects.create(
            student=third,
            course=course,
            price_at_enrollment_minor=course.price_minor,
            status=EnrollmentStatus.COMPLETED,
        ),
        rating=1,
    )

    response = logged_in(owner).get(f"{REVIEWS}summary/?course={course.public_id}")

    assert response.status_code == 200, response.data
    row = response.data[0]
    assert row["review_count"] == 2
    assert row["average_rating"] == 3.0
    assert row["distribution"] == {"1": 0, "2": 1, "3": 0, "4": 1, "5": 0}


@pytest.mark.django_db
def test_summary_for_a_course_with_no_reviews(logged_in, owner, course):
    response = logged_in(owner).get(f"{REVIEWS}summary/?course={course.public_id}")

    assert response.status_code == 200
    assert response.data[0]["review_count"] == 0
    assert response.data[0]["average_rating"] is None
