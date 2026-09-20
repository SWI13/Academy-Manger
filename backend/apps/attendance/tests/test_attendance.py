"""
Registers.

Two properties carry the weight here.

The first is scope: a professor takes the register for their own courses and
nobody else's, a student sees their own line and not their classmates', and
reception answers "was my child in on Tuesday" without being able to change
the answer. All three are queryset-level, so the wrong course is 404 rather
than 403.

The second is that the sheet is written whole. A professor marking forty names
on institute Wi-Fi either saves all of them or none, and a correction three
weeks later leaves a trail on the row itself.
"""

from datetime import date, timedelta

import pytest
from django.core.cache import cache

from apps.attendance.models import AttendanceRecord, AttendanceSession, SessionStatus
from apps.audit.models import AuditAction, AuditLog
from apps.courses.models import AssignmentStatus, Course, CourseProfessor, CourseStatus
from apps.enrollments.models import Enrollment, EnrollmentStatus
from conftest import make_user

SESSIONS = "/api/v1/attendance/sessions/"
RECORDS = "/api/v1/attendance/records/"
SUMMARY = "/api/v1/attendance/summary/"


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
    professor = make_user("PROFESSOR", phone="+213555100001")
    CourseProfessor.objects.create(
        course=course, professor=professor, status=AssignmentStatus.ACTIVE
    )
    return professor


@pytest.fixture
def klass(db, course):
    """Three students on the course."""
    students = [
        make_user("STUDENT", phone=f"+21355510{index:04d}", last_name=name)
        for index, name in enumerate(("Amrani", "Benali", "Cherif"), start=100)
    ]
    return [
        Enrollment.objects.create(
            student=student,
            course=course,
            price_at_enrollment_minor=course.price_minor,
            currency="DZD",
        )
        for student in students
    ]


@pytest.fixture
def session(db, course):
    return AttendanceSession.objects.create(course=course, held_on=date(2026, 9, 7))


def sheet(klass, *statuses):
    return {
        "rows": [
            {"enrollment": enrolment.pk, "status": status}
            for enrolment, status in zip(klass, statuses, strict=False)
        ]
    }


# ---------------------------------------------------------------------------
# Opening a register
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_a_teacher_opens_a_register_for_their_own_course(logged_in, teacher, course):
    response = logged_in(teacher).post(
        SESSIONS, {"course": course.pk, "held_on": "2026-09-07"}, format="json"
    )
    assert response.status_code == 201, response.data
    assert response.data["course_public_id"] == course.public_id


@pytest.mark.django_db
def test_a_teacher_cannot_open_a_register_for_a_course_they_do_not_teach(
    logged_in, teacher, other_course
):
    response = logged_in(teacher).post(
        SESSIONS, {"course": other_course.pk, "held_on": "2026-09-07"}, format="json"
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_opening_a_register_twice_returns_the_one_that_exists(logged_in, teacher, course):
    """Two people opening Tuesday's register is ordinary, not an error."""
    client = logged_in(teacher)
    first = client.post(SESSIONS, {"course": course.pk, "held_on": "2026-09-07"}, format="json")
    second = client.post(SESSIONS, {"course": course.pk, "held_on": "2026-09-07"}, format="json")

    assert first.status_code == 201
    assert second.status_code == 200
    assert first.data["id"] == second.data["id"]
    assert AttendanceSession.objects.count() == 1


@pytest.mark.django_db
def test_a_register_cannot_be_dated_outside_the_course(logged_in, teacher, course):
    response = logged_in(teacher).post(
        SESSIONS, {"course": course.pk, "held_on": "2027-06-01"}, format="json"
    )
    assert response.status_code == 400
    assert "held_on" in response.data["error"]["details"]


@pytest.mark.django_db
def test_reception_cannot_open_a_register(logged_in, reception, course):
    """The desk reads registers. Taking one is `attendance.record`."""
    response = logged_in(reception).post(
        SESSIONS, {"course": course.pk, "held_on": "2026-09-07"}, format="json"
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_registers_are_never_deleted(logged_in, owner, session):
    """A record of who was in a room on a date is not a thing to destroy."""
    assert logged_in(owner).delete(f"{SESSIONS}{session.pk}/").status_code == 405


# ---------------------------------------------------------------------------
# The sheet
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_an_untaken_register_answers_with_the_whole_roster(logged_in, teacher, session, klass):
    """A blank sheet of the class is what a professor carries into the room."""
    response = logged_in(teacher).get(f"{SESSIONS}{session.pk}/sheet/")
    assert response.status_code == 200
    assert len(response.data["rows"]) == 3
    assert {row["status"] for row in response.data["rows"]} == {""}
    assert response.data["totals"]["total"] == 0
    assert response.data["totals"]["rate"] is None


@pytest.mark.django_db
def test_the_roster_is_in_alphabetical_order(logged_in, teacher, session, klass):
    rows = logged_in(teacher).get(f"{SESSIONS}{session.pk}/sheet/").data["rows"]
    assert [row["student_name"].split()[-1] for row in rows] == ["Amrani", "Benali", "Cherif"]


@pytest.mark.django_db
def test_a_cancelled_enrolment_is_off_the_register(logged_in, teacher, session, klass):
    klass[0].status = EnrollmentStatus.CANCELLED
    klass[0].save(update_fields=["status"])
    rows = logged_in(teacher).get(f"{SESSIONS}{session.pk}/sheet/").data["rows"]
    assert len(rows) == 2


@pytest.mark.django_db
def test_a_student_sees_their_own_line_and_nobody_elses(logged_in, session, klass):
    student = klass[1].student
    rows = logged_in(student).get(f"{SESSIONS}{session.pk}/sheet/").data["rows"]
    assert len(rows) == 1
    assert rows[0]["student_public_id"] == student.public_id


# ---------------------------------------------------------------------------
# Writing the register
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_the_whole_sheet_is_saved_at_once(logged_in, teacher, session, klass):
    response = logged_in(teacher).put(
        f"{SESSIONS}{session.pk}/register/",
        sheet(klass, "PRESENT", "ABSENT", "LATE"),
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["created"] == 3
    assert response.data["updated"] == 0
    assert AttendanceRecord.objects.count() == 3


@pytest.mark.django_db
def test_saving_a_register_submits_it(logged_in, teacher, session, klass):
    logged_in(teacher).put(
        f"{SESSIONS}{session.pk}/register/", sheet(klass, "PRESENT"), format="json"
    )
    session.refresh_from_db()
    assert session.status == SessionStatus.SUBMITTED
    assert session.submitted_at is not None


@pytest.mark.django_db
def test_a_correction_is_recorded_on_the_row_and_in_the_log(logged_in, teacher, session, klass):
    """Registers do not lock, so the trail is what carries the weight."""
    client = logged_in(teacher)
    client.put(f"{SESSIONS}{session.pk}/register/", sheet(klass, "ABSENT"), format="json")
    again = client.put(f"{SESSIONS}{session.pk}/register/", sheet(klass, "PRESENT"), format="json")

    assert again.data["updated"] == 1
    row = AttendanceRecord.objects.get(enrollment=klass[0])
    assert row.status == "PRESENT"
    assert row.change_count == 1
    assert row.was_corrected

    entry = AuditLog.objects.filter(action=AuditAction.ATTENDANCE_CHANGED).first()
    assert entry is not None
    assert entry.old_values["status"] == "ABSENT"
    assert entry.new_values["status"] == "PRESENT"


@pytest.mark.django_db
def test_resaving_an_unchanged_sheet_does_not_inflate_the_edit_count(
    logged_in, teacher, session, klass
):
    client = logged_in(teacher)
    client.put(f"{SESSIONS}{session.pk}/register/", sheet(klass, "PRESENT"), format="json")
    again = client.put(f"{SESSIONS}{session.pk}/register/", sheet(klass, "PRESENT"), format="json")
    assert again.data == {**again.data, "created": 0, "updated": 0, "unchanged": 1}
    assert AttendanceRecord.objects.get(enrollment=klass[0]).change_count == 0


@pytest.mark.django_db
def test_taking_the_register_is_one_audit_row_not_forty(logged_in, teacher, session, klass):
    logged_in(teacher).put(
        f"{SESSIONS}{session.pk}/register/",
        sheet(klass, "PRESENT", "PRESENT", "PRESENT"),
        format="json",
    )
    assert AuditLog.objects.filter(action=AuditAction.ATTENDANCE_TAKEN).count() == 1


@pytest.mark.django_db
def test_a_row_for_somebody_on_another_course_is_refused(
    logged_in, teacher, session, klass, other_course
):
    outsider = make_user("STUDENT", phone="+213555199999")
    elsewhere = Enrollment.objects.create(
        student=outsider, course=other_course, price_at_enrollment_minor=0, currency="DZD"
    )
    response = logged_in(teacher).put(
        f"{SESSIONS}{session.pk}/register/",
        {"rows": [{"enrollment": elsewhere.pk, "status": "PRESENT"}]},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_a_name_cannot_appear_twice_on_one_sheet(logged_in, teacher, session, klass):
    response = logged_in(teacher).put(
        f"{SESSIONS}{session.pk}/register/",
        {
            "rows": [
                {"enrollment": klass[0].pk, "status": "PRESENT"},
                {"enrollment": klass[0].pk, "status": "ABSENT"},
            ]
        },
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_minutes_are_dropped_when_a_late_mark_becomes_present(logged_in, teacher, session, klass):
    """Otherwise a corrected row keeps a lateness that no longer happened."""
    client = logged_in(teacher)
    client.put(
        f"{SESSIONS}{session.pk}/register/",
        {"rows": [{"enrollment": klass[0].pk, "status": "LATE", "minutes_late": 10}]},
        format="json",
    )
    client.put(
        f"{SESSIONS}{session.pk}/register/",
        {"rows": [{"enrollment": klass[0].pk, "status": "PRESENT", "minutes_late": 10}]},
        format="json",
    )
    assert AttendanceRecord.objects.get(enrollment=klass[0]).minutes_late is None


@pytest.mark.django_db
def test_a_teacher_cannot_write_a_register_for_another_course(
    logged_in, teacher, other_course, klass
):
    elsewhere = AttendanceSession.objects.create(course=other_course, held_on=date(2026, 9, 7))
    response = logged_in(teacher).put(
        f"{SESSIONS}{elsewhere.pk}/register/", {"rows": []}, format="json"
    )
    # 404, not 403: the register is outside their scope, so it does not exist
    # as far as they are concerned.
    assert response.status_code == 404


@pytest.mark.django_db
def test_reception_cannot_write_a_register(logged_in, reception, session, klass):
    response = logged_in(reception).put(
        f"{SESSIONS}{session.pk}/register/", sheet(klass, "PRESENT"), format="json"
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_a_student_cannot_mark_themselves_present(logged_in, session, klass):
    response = logged_in(klass[0].student).put(
        f"{SESSIONS}{session.pk}/register/", sheet(klass, "PRESENT"), format="json"
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Reading registers
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_reception_reads_every_register(logged_in, reception, session, klass, teacher):
    logged_in(teacher).put(
        f"{SESSIONS}{session.pk}/register/", sheet(klass, "PRESENT"), format="json"
    )
    response = logged_in(reception).get(SESSIONS)
    assert response.status_code == 200
    assert response.data["count"] == 1


@pytest.mark.django_db
def test_a_teacher_sees_only_their_own_registers(logged_in, teacher, session, other_course):
    AttendanceSession.objects.create(course=other_course, held_on=date(2026, 9, 7))
    response = logged_in(teacher).get(SESSIONS)
    assert response.data["count"] == 1
    assert response.data["results"][0]["id"] == session.pk


@pytest.mark.django_db
def test_a_student_reads_their_own_rows_and_no_classmates(logged_in, teacher, session, klass):
    logged_in(teacher).put(
        f"{SESSIONS}{session.pk}/register/",
        sheet(klass, "PRESENT", "ABSENT", "LATE"),
        format="json",
    )
    response = logged_in(klass[0].student).get(RECORDS)
    assert response.data["count"] == 1
    assert response.data["results"][0]["student_public_id"] == klass[0].student.public_id


@pytest.mark.django_db
def test_records_are_read_only(logged_in, owner, session, klass, teacher):
    """
    Attendance is written a sheet at a time, never a row at a time.

    Refused for the owner too, and refused by the deny-by-default rule rather
    than by a handler: the viewset maps no write action, and an action a view
    does not map is denied to everybody (architecture, Phase 2). What the
    test pins down is that no second write path exists - not which of 403 or
    405 the platform picks to say so.
    """
    logged_in(teacher).put(
        f"{SESSIONS}{session.pk}/register/", sheet(klass, "PRESENT"), format="json"
    )
    row = AttendanceRecord.objects.first()
    client = logged_in(owner)

    assert client.patch(f"{RECORDS}{row.pk}/", {"status": "ABSENT"}, format="json").status_code in (
        403,
        405,
    )
    assert client.delete(f"{RECORDS}{row.pk}/").status_code in (403, 405)

    row.refresh_from_db()
    assert row.status == "PRESENT"


# ---------------------------------------------------------------------------
# The figures
# ---------------------------------------------------------------------------
@pytest.fixture
def a_fortnight(db, course, teacher, klass):
    """Three students, three registers, a mixture of marks."""
    marks = [
        ("PRESENT", "PRESENT", "ABSENT"),
        ("PRESENT", "LATE", "ABSENT"),
        ("ABSENT", "PRESENT", "PRESENT"),
    ]
    for offset, statuses in enumerate(marks):
        held = date(2026, 9, 7) + timedelta(days=offset)
        session = AttendanceSession.objects.create(course=course, held_on=held)
        for enrolment, status in zip(klass, statuses, strict=True):
            AttendanceRecord.objects.create(session=session, enrollment=enrolment, status=status)


@pytest.mark.django_db
def test_late_counts_as_attended(logged_in, owner, a_fortnight):
    """
    The one definition of an attendance rate in the platform.

    Nine marks: five present, one late, three absent. Six of nine attended.
    """
    totals = logged_in(owner).get(SUMMARY).data["totals"]
    assert (totals["present"], totals["late"], totals["absent"]) == (5, 1, 3)
    assert totals["total"] == 9
    assert totals["rate"] == pytest.approx(66.7)


@pytest.mark.django_db
def test_a_course_nobody_has_taken_a_register_for_has_no_rate(logged_in, owner, course):
    """Not zero. Zero is a class where nobody came."""
    summary = logged_in(owner).get(f"{SUMMARY}?course={course.public_id}").data
    assert summary["totals"]["rate"] is None
    assert summary["totals"]["total"] == 0


@pytest.mark.django_db
def test_the_summary_carries_a_row_per_student(logged_in, owner, a_fortnight, klass):
    students = logged_in(owner).get(SUMMARY).data["students"]
    assert len(students) == 3
    first = next(row for row in students if row["student_public_id"] == klass[0].student.public_id)
    assert (first["present"], first["late"], first["absent"]) == (2, 0, 1)
    assert first["rate"] == pytest.approx(66.7)


@pytest.mark.django_db
def test_the_summary_narrows_to_one_student(logged_in, owner, a_fortnight, klass):
    student = klass[1].student
    summary = logged_in(owner).get(f"{SUMMARY}?student={student.public_id}").data
    assert summary["totals"]["total"] == 3
    assert len(summary["students"]) == 1


@pytest.mark.django_db
def test_the_summary_narrows_to_a_period(logged_in, owner, a_fortnight):
    summary = logged_in(owner).get(f"{SUMMARY}?from=2026-09-08&to=2026-09-08").data
    assert summary["totals"]["total"] == 3
    assert summary["session_count"] == 1


@pytest.mark.django_db
def test_a_student_summary_is_only_ever_their_own(logged_in, a_fortnight, klass):
    """Asking for the whole course as a student answers with their own rows."""
    summary = logged_in(klass[0].student).get(SUMMARY).data
    assert summary["totals"]["total"] == 3
    assert len(summary["students"]) == 1
    assert summary["students"][0]["student_public_id"] == klass[0].student.public_id


@pytest.mark.django_db
def test_a_teacher_asking_about_a_course_they_do_not_teach_gets_nothing(
    logged_in, teacher, other_course, a_fortnight
):
    summary = logged_in(teacher).get(f"{SUMMARY}?course={other_course.public_id}").data
    assert summary["totals"]["total"] == 0


# ---------------------------------------------------------------------------
# Printing
# ---------------------------------------------------------------------------
@pytest.mark.django_db
def test_the_printed_register_list_is_not_paginated(logged_in, owner, course, teacher):
    for offset in range(30):
        AttendanceSession.objects.create(
            course=course, held_on=date(2026, 9, 7) + timedelta(days=offset)
        )
    response = logged_in(owner).get(f"{SESSIONS}print/")
    assert response.status_code == 200
    assert len(response.data["results"]) == 30
    assert response.data["count"] == 30
    assert response.data["truncated"] is False


@pytest.mark.django_db
def test_the_printed_register_list_runs_oldest_first(logged_in, owner, a_fortnight):
    rows = logged_in(owner).get(f"{SESSIONS}print/").data["results"]
    assert [row["held_on"] for row in rows] == sorted(row["held_on"] for row in rows)


@pytest.mark.django_db
def test_printing_is_scoped_exactly_as_the_list_is(logged_in, teacher, session, other_course):
    """Printing must never be a way around a permission."""
    AttendanceSession.objects.create(course=other_course, held_on=date(2026, 9, 7))
    response = logged_in(teacher).get(f"{SESSIONS}print/")
    assert response.data["count"] == 1


@pytest.mark.django_db
def test_a_student_cannot_print_the_whole_class(logged_in, klass, a_fortnight):
    response = logged_in(klass[0].student).get(f"{RECORDS}print/")
    assert response.status_code == 200
    assert response.data["count"] == 3  # their own three, not nine
