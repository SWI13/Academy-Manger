"""
Courses, enrolments and schedules.

The scoping tests are the point: this is the phase where a professor's reach
stops being "themselves" and becomes "their courses", so it is the first place
that scope can be wrong in an interesting way.
"""

from datetime import date, timedelta

import pytest
from django.core.cache import cache

from apps.courses.models import AssignmentStatus, Course, CourseProfessor, CourseStatus
from apps.enrollments.models import Enrollment, EnrollmentStatus
from apps.schedules.models import Schedule

COURSES = "/api/v1/courses/"
ENROLLMENTS = "/api/v1/enrollments/"
SCHEDULES = "/api/v1/schedules/"


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


def course_payload(**overrides):
    return {
        "title": "French A1",
        "start_date": "2026-09-01",
        "end_date": "2026-12-30",
        "price_minor": 3_000_000,
        "currency": "DZD",
        **overrides,
    }


# --- course identifiers and integrity ---------------------------------------


@pytest.mark.django_db
def test_course_id_is_year_scoped(logged_in, owner):
    client = logged_in(owner)
    first = client.post(COURSES, course_payload(), format="json")
    second = client.post(COURSES, course_payload(title="Spanish A1"), format="json")

    assert first.data["public_id"] == "C-2026-001"
    assert second.data["public_id"] == "C-2026-002"


@pytest.mark.django_db
def test_a_course_cannot_end_before_it_starts(logged_in, owner):
    client = logged_in(owner)
    response = client.post(
        COURSES, course_payload(start_date="2026-12-01", end_date="2026-09-01"), format="json"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_courses_are_archived_not_deleted(logged_in, owner, course):
    client = logged_in(owner)
    assert client.delete(f"{COURSES}{course.public_id}/").status_code == 405

    response = client.post(
        f"{COURSES}{course.public_id}/status/", {"status": "ARCHIVED"}, format="json"
    )
    assert response.status_code == 200
    course.refresh_from_db()
    assert course.status == CourseStatus.ARCHIVED
    assert course.archived_at is not None


# --- course scoping ---------------------------------------------------------


@pytest.mark.django_db
def test_reception_cannot_see_draft_courses(logged_in, reception, owner):
    Course.objects.create(
        title="Unfinished",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 12, 1),
        status=CourseStatus.DRAFT,
    )
    client = logged_in(reception)
    assert client.get(COURSES).data["count"] == 0


@pytest.mark.django_db
def test_a_professor_sees_only_courses_they_teach(logged_in, professor, taught_course):
    other = Course.objects.create(
        title="Someone else's",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 12, 1),
        status=CourseStatus.ACTIVE,
    )
    client = logged_in(professor)
    returned = [c["public_id"] for c in client.get(COURSES).data["results"]]

    assert returned == [taught_course.public_id]
    assert other.public_id not in returned


@pytest.mark.django_db
def test_a_professor_reading_an_unassigned_course_gets_404(logged_in, professor, course):
    client = logged_in(professor)
    assert client.get(f"{COURSES}{course.public_id}/").status_code == 404


@pytest.mark.django_db
def test_a_student_sees_courses_they_are_enrolled_in(logged_in, student, course):
    Enrollment.objects.create(
        student=student, course=course, price_at_enrollment_minor=course.price_minor
    )
    client = logged_in(student)
    assert [c["public_id"] for c in client.get(COURSES).data["results"]] == [course.public_id]


@pytest.mark.django_db
def test_price_is_hidden_from_students_and_professors(logged_in, professor, taught_course):
    client = logged_in(professor)
    response = client.get(f"{COURSES}{taught_course.public_id}/")
    assert "price_minor" not in response.data


@pytest.mark.django_db
def test_price_is_visible_to_reception(logged_in, reception, course):
    client = logged_in(reception)
    response = client.get(f"{COURSES}{course.public_id}/")
    assert response.data["price_minor"] == 5_000_000


# --- professor assignment ---------------------------------------------------


@pytest.mark.django_db
def test_owner_can_assign_a_professor(logged_in, owner, course, professor):
    client = logged_in(owner)
    response = client.post(
        f"{COURSES}{course.public_id}/professors/",
        {"professor_public_id": professor.public_id},
        format="json",
    )
    assert response.status_code == 201
    assert CourseProfessor.objects.filter(course=course, professor=professor).exists()


@pytest.mark.django_db
def test_a_non_professor_cannot_be_assigned_to_teach(logged_in, owner, course, student):
    """Assigning a student would hand them the roster and mark-entry scope."""
    client = logged_in(owner)
    response = client.post(
        f"{COURSES}{course.public_id}/professors/",
        {"professor_public_id": student.public_id},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_reception_cannot_assign_professors(logged_in, reception, course, professor):
    client = logged_in(reception)
    response = client.post(
        f"{COURSES}{course.public_id}/professors/",
        {"professor_public_id": professor.public_id},
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_unassigning_ends_the_row_rather_than_deleting_it(
    logged_in, owner, taught_course, professor
):
    client = logged_in(owner)
    response = client.delete(
        f"{COURSES}{taught_course.public_id}/professors/",
        {"professor_public_id": professor.public_id},
        format="json",
    )
    assert response.status_code == 204

    row = CourseProfessor.objects.get(course=taught_course, professor=professor)
    assert row.status == AssignmentStatus.ENDED
    assert row.ended_at is not None


# --- enrolment --------------------------------------------------------------


@pytest.mark.django_db
def test_reception_can_enrol_a_student(logged_in, reception, course, student):
    client = logged_in(reception)
    response = client.post(
        ENROLLMENTS,
        {"student_public_id": student.public_id, "course_public_id": course.public_id},
        format="json",
    )
    assert response.status_code == 201


@pytest.mark.django_db
def test_price_is_frozen_at_enrolment(logged_in, reception, course, student):
    """
    The catalogue price moves; the contract does not. A balance computed from
    today's course price would silently rewrite last term's invoices.
    """
    client = logged_in(reception)
    client.post(
        ENROLLMENTS,
        {"student_public_id": student.public_id, "course_public_id": course.public_id},
        format="json",
    )

    course.price_minor = 9_999_999
    course.save(update_fields=["price_minor"])

    enrollment = Enrollment.objects.get(student=student, course=course)
    assert enrollment.price_at_enrollment_minor == 5_000_000


@pytest.mark.django_db
def test_a_client_cannot_choose_its_own_price(logged_in, reception, course, student):
    """A client-supplied price is a discount anyone can grant themselves."""
    client = logged_in(reception)
    client.post(
        ENROLLMENTS,
        {
            "student_public_id": student.public_id,
            "course_public_id": course.public_id,
            "price_at_enrollment_minor": 1,
        },
        format="json",
    )
    assert Enrollment.objects.get(student=student).price_at_enrollment_minor == 5_000_000


@pytest.mark.django_db
def test_a_student_cannot_be_enrolled_twice(logged_in, reception, course, student):
    client = logged_in(reception)
    body = {"student_public_id": student.public_id, "course_public_id": course.public_id}
    assert client.post(ENROLLMENTS, body, format="json").status_code == 201
    assert client.post(ENROLLMENTS, body, format="json").status_code == 400


@pytest.mark.django_db
def test_a_student_can_re_enrol_after_dropping(logged_in, reception, course, student):
    """A retake is a second enrolment with its own clean set of marks."""
    client = logged_in(reception)
    body = {"student_public_id": student.public_id, "course_public_id": course.public_id}
    client.post(ENROLLMENTS, body, format="json")

    Enrollment.objects.filter(student=student).update(status=EnrollmentStatus.DROPPED)

    assert client.post(ENROLLMENTS, body, format="json").status_code == 201
    assert Enrollment.objects.filter(student=student, course=course).count() == 2


@pytest.mark.django_db
def test_capacity_is_enforced(logged_in, reception, student):
    from conftest import make_user

    full = Course.objects.create(
        title="Small group",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 12, 1),
        status=CourseStatus.ACTIVE,
        capacity=1,
    )
    client = logged_in(reception)
    client.post(
        ENROLLMENTS,
        {"student_public_id": student.public_id, "course_public_id": full.public_id},
        format="json",
    )

    second = make_user("STUDENT", phone="+213555000077")
    response = client.post(
        ENROLLMENTS,
        {"student_public_id": second.public_id, "course_public_id": full.public_id},
        format="json",
    )
    assert response.status_code == 400
    assert "full" in str(response.data).lower()


@pytest.mark.django_db
def test_cannot_enrol_in_a_cancelled_course(logged_in, reception, course, student):
    course.status = CourseStatus.CANCELLED
    course.save(update_fields=["status"])

    client = logged_in(reception)
    response = client.post(
        ENROLLMENTS,
        {"student_public_id": student.public_id, "course_public_id": course.public_id},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_enrolments_are_cancelled_not_deleted(logged_in, owner, course, student):
    enrollment = Enrollment.objects.create(
        student=student, course=course, price_at_enrollment_minor=1
    )
    client = logged_in(owner)
    assert client.delete(f"{ENROLLMENTS}{enrollment.pk}/").status_code == 405


# --- the roster, and its scope ---------------------------------------------


@pytest.mark.django_db
def test_a_professor_sees_the_roster_of_their_own_course(
    logged_in, professor, taught_course, student
):
    Enrollment.objects.create(student=student, course=taught_course, price_at_enrollment_minor=1)
    client = logged_in(professor)
    response = client.get(ENROLLMENTS, {"course": taught_course.public_id})

    assert response.data["count"] == 1
    row = response.data["results"][0]["student"]
    assert row["public_id"] == student.public_id
    assert "age" in row and "wilaya" in row and "prior_level" in row


@pytest.mark.django_db
def test_a_professor_cannot_see_another_courses_roster(logged_in, professor, course, student):
    Enrollment.objects.create(student=student, course=course, price_at_enrollment_minor=1)
    client = logged_in(professor)
    assert client.get(ENROLLMENTS).data["count"] == 0


@pytest.mark.django_db
def test_a_student_sees_only_their_own_enrolments(logged_in, student, course, professor):
    from conftest import make_user

    other = make_user("STUDENT", phone="+213555000088")
    Enrollment.objects.create(student=student, course=course, price_at_enrollment_minor=1)
    Enrollment.objects.create(student=other, course=course, price_at_enrollment_minor=1)

    client = logged_in(student)
    results = client.get(ENROLLMENTS).data["results"]
    assert len(results) == 1
    assert results[0]["student"]["public_id"] == student.public_id


@pytest.mark.django_db
def test_a_student_reading_another_enrolment_gets_404(logged_in, student, course):
    from conftest import make_user

    other = make_user("STUDENT", phone="+213555000089")
    theirs = Enrollment.objects.create(student=other, course=course, price_at_enrollment_minor=1)
    client = logged_in(student)
    assert client.get(f"{ENROLLMENTS}{theirs.pk}/").status_code == 404


# --- schedules --------------------------------------------------------------


@pytest.mark.django_db
def test_admin_can_create_a_schedule_slot(logged_in, admin, course):
    client = logged_in(admin)
    response = client.post(
        SCHEDULES,
        {
            "course_public_id": course.public_id,
            "weekday": 0,
            "start_time": "17:00",
            "end_time": "19:00",
            "room": "A-102",
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.data["weekday_name"] == "Monday"


@pytest.mark.django_db
def test_a_slot_must_end_after_it_starts(logged_in, admin, course):
    client = logged_in(admin)
    response = client.post(
        SCHEDULES,
        {
            "course_public_id": course.public_id,
            "weekday": 0,
            "start_time": "19:00",
            "end_time": "17:00",
        },
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_a_room_clash_warns_but_can_be_overridden(logged_in, admin, course):
    """Architecture D-5: warn, do not block. Institutes overbook while rearranging."""
    other = Course.objects.create(
        title="Other",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 12, 30),
        status=CourseStatus.ACTIVE,
    )
    Schedule.objects.create(
        course=other, weekday=0, start_time="17:00", end_time="19:00", room="A-102"
    )

    client = logged_in(admin)
    body = {
        "course_public_id": course.public_id,
        "weekday": 0,
        "start_time": "18:00",
        "end_time": "20:00",
        "room": "A-102",
    }

    blocked = client.post(SCHEDULES, body, format="json")
    assert blocked.status_code == 400
    assert "clash" in str(blocked.data).lower()

    allowed = client.post(SCHEDULES, {**body, "allow_clash": True}, format="json")
    assert allowed.status_code == 201


@pytest.mark.django_db
def test_no_clash_when_times_do_not_overlap(logged_in, admin, course):
    other = Course.objects.create(
        title="Other",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 12, 30),
        status=CourseStatus.ACTIVE,
    )
    Schedule.objects.create(
        course=other, weekday=0, start_time="09:00", end_time="11:00", room="A-102"
    )

    client = logged_in(admin)
    response = client.post(
        SCHEDULES,
        {
            "course_public_id": course.public_id,
            "weekday": 0,
            "start_time": "17:00",
            "end_time": "19:00",
            "room": "A-102",
        },
        format="json",
    )
    assert response.status_code == 201


@pytest.mark.django_db
def test_a_professor_cannot_create_schedules(logged_in, professor, taught_course):
    client = logged_in(professor)
    response = client.post(
        SCHEDULES,
        {
            "course_public_id": taught_course.public_id,
            "weekday": 0,
            "start_time": "17:00",
            "end_time": "19:00",
        },
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_a_student_sees_the_schedule_of_courses_they_take(logged_in, student, course):
    Schedule.objects.create(course=course, weekday=0, start_time="17:00", end_time="19:00")
    Enrollment.objects.create(student=student, course=course, price_at_enrollment_minor=1)

    client = logged_in(student)
    assert client.get(SCHEDULES).data["count"] == 1


@pytest.mark.django_db
def test_a_student_does_not_see_other_courses_schedules(logged_in, student, course):
    Schedule.objects.create(course=course, weekday=0, start_time="17:00", end_time="19:00")
    client = logged_in(student)
    assert client.get(SCHEDULES).data["count"] == 0


# --- what is next -----------------------------------------------------------


@pytest.mark.django_db
def test_next_session_resolves_the_pattern_and_counts_the_class(
    logged_in, professor, taught_course, student
):
    """The professor's second job: date, room and how many are coming."""
    taught_course.start_date = date.today() - timedelta(days=7)
    taught_course.end_date = date.today() + timedelta(days=60)
    taught_course.save()

    upcoming_weekday = (date.today() + timedelta(days=2)).weekday()
    Schedule.objects.create(
        course=taught_course,
        weekday=upcoming_weekday,
        start_time="17:00",
        end_time="19:00",
        room="A-102",
    )
    Enrollment.objects.create(student=student, course=taught_course, price_at_enrollment_minor=1)

    client = logged_in(professor)
    response = client.get(f"{SCHEDULES}next-session/")

    assert response.status_code == 200
    assert response.data["course_public_id"] == taught_course.public_id
    assert response.data["room"] == "A-102"
    assert response.data["enrolled_count"] == 1
    assert response.data["weekday_name"]


@pytest.mark.django_db
def test_next_session_is_204_when_nothing_is_upcoming(logged_in, professor):
    client = logged_in(professor)
    assert client.get(f"{SCHEDULES}next-session/").status_code == 204


@pytest.mark.django_db
def test_next_session_ignores_courses_the_caller_does_not_teach(logged_in, professor, course):
    course.start_date = date.today() - timedelta(days=7)
    course.end_date = date.today() + timedelta(days=60)
    course.save()
    Schedule.objects.create(
        course=course,
        weekday=(date.today() + timedelta(days=1)).weekday(),
        start_time="17:00",
        end_time="19:00",
    )

    client = logged_in(professor)
    assert client.get(f"{SCHEDULES}next-session/").status_code == 204
