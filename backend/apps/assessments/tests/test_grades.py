"""
Grades - les notes.

The scoping tests carry the most weight: this is the first place a professor
writes data, so it is the first place a scoping mistake corrupts someone
else's records rather than merely exposing them.
"""

from datetime import date
from decimal import Decimal

import pytest
from django.core.cache import cache

from apps.assessments.models import Assessment, AssessmentScore
from apps.courses.models import Course, CourseProfessor, CourseStatus
from apps.enrollments.models import Enrollment
from conftest import make_user

ASSESSMENTS = "/api/v1/assessments/"
ENROLLMENTS = "/api/v1/enrollments/"
GRADEBOOK = "/api/v1/gradebook/"


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
def taught_course(db, course, professor):
    CourseProfessor.objects.create(course=course, professor=professor)
    return course


@pytest.fixture
def enrolled(db, taught_course, student):
    return Enrollment.objects.create(
        student=student, course=taught_course, price_at_enrollment_minor=1
    )


@pytest.fixture
def quiz(db, taught_course):
    return Assessment.objects.create(
        course=taught_course, title="Unit 1 quiz", max_score=Decimal("20.00")
    )


# --- creating assessments ---------------------------------------------------


@pytest.mark.django_db
def test_a_professor_creates_an_assessment_on_their_own_course(logged_in, professor, taught_course):
    client = logged_in(professor)
    response = client.post(
        ASSESSMENTS,
        {
            "course_public_id": taught_course.public_id,
            "title": "Midterm",
            "kind": "MIDTERM",
            "max_score": "20.00",
            "weight": "2.00",
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.data["max_score"] == "20.00"


@pytest.mark.django_db
def test_a_professor_cannot_create_an_assessment_on_someone_elses_course(
    logged_in, professor, course
):
    """Otherwise they hold the mark sheet for a class that is not theirs."""
    client = logged_in(professor)
    response = client.post(
        ASSESSMENTS,
        {"course_public_id": course.public_id, "title": "Not mine"},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_the_scale_is_data_not_code(logged_in, professor, taught_course):
    """A /20 quiz and a /100 final coexist."""
    client = logged_in(professor)
    for maximum in ("20.00", "100.00", "5.00"):
        response = client.post(
            ASSESSMENTS,
            {
                "course_public_id": taught_course.public_id,
                "title": f"Out of {maximum}",
                "max_score": maximum,
            },
            format="json",
        )
        assert response.status_code == 201, response.data


@pytest.mark.django_db
def test_max_score_must_be_positive(logged_in, professor, taught_course):
    client = logged_in(professor)
    response = client.post(
        ASSESSMENTS,
        {"course_public_id": taught_course.public_id, "title": "Broken", "max_score": "0"},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_reception_cannot_touch_assessments(logged_in, reception, taught_course):
    """Reception holds no assessment permission at all."""
    client = logged_in(reception)
    assert client.get(ASSESSMENTS).status_code == 403


# --- the mark sheet ---------------------------------------------------------


@pytest.mark.django_db
def test_a_professor_saves_a_mark_sheet(logged_in, professor, quiz, enrolled, student):
    client = logged_in(professor)
    response = client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "15.50"}]},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["created"] == 1
    assert AssessmentScore.objects.get(assessment=quiz).score == Decimal("15.50")


@pytest.mark.django_db
def test_the_whole_sheet_is_rejected_if_one_row_is_invalid(
    logged_in, professor, quiz, enrolled, student
):
    """
    A half-written mark sheet is worse than a rejected one, because nobody
    knows which half landed.
    """
    client = logged_in(professor)
    response = client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {
            "rows": [
                {"student_public_id": student.public_id, "score": "15.00"},
                {"student_public_id": "STU-999999", "score": "12.00"},
            ]
        },
        format="json",
    )

    assert response.status_code == 400
    assert AssessmentScore.objects.count() == 0, "a valid row was written despite the failure"


@pytest.mark.django_db
def test_a_score_above_the_maximum_is_refused(logged_in, professor, quiz, enrolled, student):
    client = logged_in(professor)
    response = client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "25.00"}]},
        format="json",
    )
    assert response.status_code == 400
    assert "exceeds" in str(response.data).lower()


@pytest.mark.django_db
def test_a_student_not_in_the_class_is_refused(logged_in, professor, quiz, enrolled):
    outsider = make_user("STUDENT", phone="+213555000061")
    client = logged_in(professor)
    response = client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": outsider.public_id, "score": "15.00"}]},
        format="json",
    )
    assert response.status_code == 400
    assert "not in this class" in str(response.data).lower()


@pytest.mark.django_db
def test_the_same_student_twice_in_one_sheet_is_refused(
    logged_in, professor, quiz, enrolled, student
):
    client = logged_in(professor)
    response = client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {
            "rows": [
                {"student_public_id": student.public_id, "score": "15.00"},
                {"student_public_id": student.public_id, "score": "18.00"},
            ]
        },
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_resubmitting_the_same_sheet_is_safe(logged_in, professor, quiz, enrolled, student):
    """Teachers double-submit on flaky institute Wi-Fi."""
    client = logged_in(professor)
    body = {"rows": [{"student_public_id": student.public_id, "score": "15.00"}]}

    client.put(f"{ASSESSMENTS}{quiz.pk}/scores/", body, format="json")
    second = client.put(f"{ASSESSMENTS}{quiz.pk}/scores/", body, format="json")

    assert second.data["unchanged"] == 1
    assert AssessmentScore.objects.count() == 1
    assert AssessmentScore.objects.get().change_count == 0


# --- marks never lock, and the trail says so (D-7) --------------------------


@pytest.mark.django_db
def test_a_professor_can_correct_a_mark_at_any_time(logged_in, professor, quiz, enrolled, student):
    client = logged_in(professor)
    client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "15.00"}]},
        format="json",
    )
    client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "17.00"}]},
        format="json",
    )

    score = AssessmentScore.objects.get()
    assert score.score == Decimal("17.00")


@pytest.mark.django_db
def test_marks_do_not_freeze_when_the_course_completes(
    logged_in, professor, quiz, enrolled, taught_course, student
):
    """D-7: the scope is a who, not a when."""
    taught_course.status = CourseStatus.COMPLETED
    taught_course.save(update_fields=["status"])

    client = logged_in(professor)
    response = client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "19.00"}]},
        format="json",
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_an_edit_is_recorded_on_the_row_not_only_in_a_log(
    logged_in, professor, quiz, enrolled, student
):
    """
    Marks never lock, so "changeable forever" must not become "changeable
    invisibly". The edit has to show where people look at marks.
    """
    client = logged_in(professor)
    client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "15.00"}]},
        format="json",
    )
    client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "17.00"}]},
        format="json",
    )

    response = client.get(f"{ASSESSMENTS}{quiz.pk}/scores/")
    row = response.data[0]

    assert row["was_edited"] is True
    assert row["change_count"] == 1
    assert row["last_changed_at"] is not None
    assert row["last_changed_by_public_id"] == professor.public_id


# --- scoping: the part that must not be wrong -------------------------------


@pytest.mark.django_db
def test_a_professor_cannot_read_another_courses_assessment(logged_in, professor, course):
    other = Assessment.objects.create(course=course, title="Not mine")
    client = logged_in(professor)
    assert client.get(f"{ASSESSMENTS}{other.pk}/").status_code == 404


@pytest.mark.django_db
def test_a_professor_cannot_write_marks_for_another_courses_assessment(
    logged_in, professor, course
):
    """The write equivalent of the 404 test, and the more damaging one."""
    other_student = make_user("STUDENT", phone="+213555000062")
    Enrollment.objects.create(student=other_student, course=course, price_at_enrollment_minor=1)
    other = Assessment.objects.create(course=course, title="Not mine")

    client = logged_in(professor)
    response = client.put(
        f"{ASSESSMENTS}{other.pk}/scores/",
        {"rows": [{"student_public_id": other_student.public_id, "score": "20.00"}]},
        format="json",
    )

    assert response.status_code == 404
    assert AssessmentScore.objects.count() == 0


@pytest.mark.django_db
def test_a_student_cannot_enter_marks(logged_in, student, quiz, enrolled):
    """
    404, not 403: the quiz is unpublished, so it is not merely off-limits to
    the student - as far as they can tell it does not exist. That is the
    stronger answer.
    """
    client = logged_in(student)
    response = client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "20.00"}]},
        format="json",
    )
    assert response.status_code == 404
    assert AssessmentScore.objects.count() == 0


@pytest.mark.django_db
def test_a_student_cannot_enter_marks_even_on_a_published_assessment(
    logged_in, professor, student, quiz, enrolled
):
    """Once it is visible, the refusal is 403 - they can see it, they may not write it."""
    logged_in(professor).post(f"{ASSESSMENTS}{quiz.pk}/publish/")

    client = logged_in(student)
    response = client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "20.00"}]},
        format="json",
    )
    assert response.status_code == 403
    assert AssessmentScore.objects.count() == 0


# --- publishing -------------------------------------------------------------


@pytest.mark.django_db
def test_students_cannot_see_unpublished_assessments(logged_in, student, quiz, enrolled):
    client = logged_in(student)
    assert client.get(ASSESSMENTS).data["count"] == 0
    assert client.get(f"{ASSESSMENTS}{quiz.pk}/").status_code == 404


@pytest.mark.django_db
def test_publishing_makes_an_assessment_visible(logged_in, professor, student, quiz, enrolled):
    logged_in(professor).post(f"{ASSESSMENTS}{quiz.pk}/publish/")

    client = logged_in(student)
    assert client.get(ASSESSMENTS).data["count"] == 1


@pytest.mark.django_db
def test_a_student_sees_their_own_marks_once_published(
    api, logged_in, professor, student, quiz, enrolled
):
    prof_client = logged_in(professor)
    prof_client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "15.00"}]},
        format="json",
    )
    prof_client.post(f"{ASSESSMENTS}{quiz.pk}/publish/")

    from rest_framework.test import APIClient

    from conftest import PASSWORD

    student_client = APIClient()
    student_client.post(
        "/api/v1/auth/login/",
        {"identifier": student.public_id, "password": PASSWORD},
        format="json",
    )
    response = student_client.get(f"{ASSESSMENTS}my-marks/")

    assert len(response.data) == 1
    assert response.data[0]["score"] == "15.00"


@pytest.mark.django_db
def test_a_student_does_not_see_another_students_marks(
    logged_in, professor, student, quiz, enrolled, taught_course
):
    other = make_user("STUDENT", phone="+213555000063")
    Enrollment.objects.create(student=other, course=taught_course, price_at_enrollment_minor=1)

    prof = logged_in(professor)
    prof.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {
            "rows": [
                {"student_public_id": student.public_id, "score": "15.00"},
                {"student_public_id": other.public_id, "score": "18.00"},
            ]
        },
        format="json",
    )
    prof.post(f"{ASSESSMENTS}{quiz.pk}/publish/")

    client = logged_in(student)
    marks = client.get(f"{ASSESSMENTS}my-marks/").data

    assert len(marks) == 1
    assert marks[0]["student_public_id"] == student.public_id


# --- averages ---------------------------------------------------------------


@pytest.mark.django_db
def test_weighted_average_respects_weights(logged_in, professor, taught_course, enrolled, student):
    """1/1/2 makes the last assessment worth half the course."""
    quiz_a = Assessment.objects.create(
        course=taught_course, title="Q1", max_score=Decimal("20"), weight=Decimal("1")
    )
    quiz_b = Assessment.objects.create(
        course=taught_course, title="Q2", max_score=Decimal("20"), weight=Decimal("1")
    )
    final = Assessment.objects.create(
        course=taught_course, title="Final", max_score=Decimal("100"), weight=Decimal("2")
    )

    client = logged_in(professor)
    for assessment, score in ((quiz_a, "10.00"), (quiz_b, "20.00"), (final, "50.00")):
        client.put(
            f"{ASSESSMENTS}{assessment.pk}/scores/",
            {"rows": [{"student_public_id": student.public_id, "score": score}]},
            format="json",
        )

    response = client.get(f"{ENROLLMENTS}{enrolled.pk}/average/")

    # (50*1 + 100*1 + 50*2) / 4 = 62.50
    assert response.data["weighted_percentage"] == "62.50"
    assert response.data["marked_count"] == 3


@pytest.mark.django_db
def test_average_is_null_when_nothing_is_marked(logged_in, professor, enrolled, quiz):
    client = logged_in(professor)
    response = client.get(f"{ENROLLMENTS}{enrolled.pk}/average/")
    assert response.data["weighted_percentage"] is None
    assert response.data["marked_count"] == 0


@pytest.mark.django_db
def test_unmarked_assessments_are_excluded_not_counted_as_zero(
    logged_in, professor, taught_course, enrolled, student
):
    """A student who has not sat the final has no final mark, not a zero."""
    marked = Assessment.objects.create(
        course=taught_course, title="Sat it", max_score=Decimal("20"), weight=Decimal("1")
    )
    Assessment.objects.create(
        course=taught_course, title="Missed it", max_score=Decimal("20"), weight=Decimal("1")
    )

    client = logged_in(professor)
    client.put(
        f"{ASSESSMENTS}{marked.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "20.00"}]},
        format="json",
    )

    response = client.get(f"{ENROLLMENTS}{enrolled.pk}/average/")
    assert response.data["weighted_percentage"] == "100.00"
    assert response.data["assessment_count"] == 2


@pytest.mark.django_db
def test_a_students_average_ignores_unpublished_marks(
    logged_in, professor, taught_course, enrolled, student
):
    """Counting them would leak unpublished marks through the arithmetic."""
    published = Assessment.objects.create(
        course=taught_course, title="Published", max_score=Decimal("20"), weight=Decimal("1")
    )
    hidden = Assessment.objects.create(
        course=taught_course, title="Hidden", max_score=Decimal("20"), weight=Decimal("1")
    )

    prof = logged_in(professor)
    prof.put(
        f"{ASSESSMENTS}{published.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "20.00"}]},
        format="json",
    )
    prof.put(
        f"{ASSESSMENTS}{hidden.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "0.00"}]},
        format="json",
    )
    prof.post(f"{ASSESSMENTS}{published.pk}/publish/")

    student_client = logged_in(student)
    response = student_client.get(f"{ENROLLMENTS}{enrolled.pk}/average/")

    assert response.data["weighted_percentage"] == "100.00"
    assert response.data["marked_count"] == 1


@pytest.mark.django_db
def test_a_student_cannot_read_another_students_average(logged_in, student, taught_course):
    other = make_user("STUDENT", phone="+213555000064")
    theirs = Enrollment.objects.create(
        student=other, course=taught_course, price_at_enrollment_minor=1
    )
    client = logged_in(student)
    assert client.get(f"{ENROLLMENTS}{theirs.pk}/average/").status_code == 404


# --- gradebook --------------------------------------------------------------


@pytest.mark.django_db
def test_gradebook_lists_the_class_with_averages(
    logged_in, professor, taught_course, enrolled, student, quiz
):
    client = logged_in(professor)
    client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "16.00"}]},
        format="json",
    )

    response = client.get(GRADEBOOK, {"course": taught_course.public_id})

    assert response.status_code == 200
    assert response.data["course_public_id"] == taught_course.public_id
    row = response.data["students"][0]
    assert row["student_public_id"] == student.public_id
    assert row["weighted_percentage"] == Decimal("80.00")
    assert "age" in row and "wilaya" in row and "prior_level" in row


@pytest.mark.django_db
def test_gradebook_refuses_a_course_the_caller_does_not_teach(logged_in, professor, course):
    client = logged_in(professor)
    assert client.get(GRADEBOOK, {"course": course.public_id}).status_code == 404


@pytest.mark.django_db
def test_gradebook_needs_a_course(logged_in, professor):
    client = logged_in(professor)
    assert client.get(GRADEBOOK).status_code == 400


# --- assessments with marks are not disposable ------------------------------


@pytest.mark.django_db
def test_an_assessment_with_marks_cannot_be_deleted(logged_in, professor, quiz, enrolled, student):
    """Deleting it would take the marks with it. Marks are the record."""
    client = logged_in(professor)
    client.put(
        f"{ASSESSMENTS}{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "15.00"}]},
        format="json",
    )

    response = client.delete(f"{ASSESSMENTS}{quiz.pk}/")

    assert response.status_code == 403
    assert Assessment.objects.filter(pk=quiz.pk).exists()


@pytest.mark.django_db
def test_an_unmarked_assessment_can_be_deleted(logged_in, professor, quiz):
    client = logged_in(professor)
    assert client.delete(f"{ASSESSMENTS}{quiz.pk}/").status_code == 204
