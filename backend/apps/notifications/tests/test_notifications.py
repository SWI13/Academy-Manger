"""
Notifications and dashboards.

The dashboard tests matter most: a tile the API never sends cannot leak, so
what is asserted is absence, not that the frontend declines to render it.
"""

from datetime import date, timedelta

import pytest
from django.core.cache import cache

from apps.courses.models import Course, CourseProfessor, CourseStatus
from apps.enrollments.models import Enrollment
from apps.notifications.models import Channel, DeliveryStatus, Notification, NotificationKind
from apps.notifications.services import notify
from apps.notifications.tasks import send_session_reminders
from apps.schedules.models import Schedule
from conftest import make_user

NOTIFICATIONS = "/api/v1/notifications/"
DASHBOARD = "/api/v1/reports/dashboard/"
PAYMENTS = "/api/v1/payments/"
COURSES = "/api/v1/courses/"


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def course(db):
    return Course.objects.create(
        title="English B2",
        start_date=date.today() - timedelta(days=7),
        end_date=date.today() + timedelta(days=60),
        price_minor=5_000_000,
        status=CourseStatus.ACTIVE,
    )


@pytest.fixture
def enrolled(db, course, student):
    return Enrollment.objects.create(
        student=student, course=course, price_at_enrollment_minor=5_000_000
    )


# --- delivery ---------------------------------------------------------------


@pytest.mark.django_db
def test_a_notification_records_its_channel_and_delivery(student):
    """
    SMS is planned (D-8), so these fields exist from the start - adding a
    channel later is a class, not an ALTER on a table full of history.
    """
    notification = notify(student, NotificationKind.ENROLLED, "Hello", "Body")

    assert notification.channel == Channel.IN_APP
    assert notification.delivery_status == DeliveryStatus.DELIVERED
    assert notification.delivered_at is not None


@pytest.mark.django_db
def test_a_deactivated_user_is_not_notified(student):
    student.deactivate()
    assert notify(student, NotificationKind.ENROLLED, "Hello", "Body") is None


@pytest.mark.django_db
def test_the_sms_channel_is_not_enabled(student):
    from apps.notifications.channels import enabled_channels, get_channel

    assert enabled_channels() == [Channel.IN_APP]
    with pytest.raises(ValueError, match="No delivery channel"):
        get_channel(Channel.SMS)


# --- events that produce notifications --------------------------------------


@pytest.mark.django_db
def test_a_student_is_told_when_a_payment_is_confirmed(
    logged_in, reception, admin, enrolled, student
):
    payment = (
        logged_in(reception)
        .post(
            PAYMENTS,
            {
                "enrollment_id": enrolled.pk,
                "amount_minor": 1_000_000,
                "paid_on": str(date.today()),
                "method": "CASH",
            },
            format="json",
        )
        .data
    )
    logged_in(admin).post(f"{PAYMENTS}{payment['public_id']}/approve/")

    notification = Notification.objects.get(
        recipient=student, kind=NotificationKind.PAYMENT_APPROVED
    )
    assert "confirmed" in notification.message.lower()


@pytest.mark.django_db
def test_a_rejection_tells_the_student_why(logged_in, reception, admin, enrolled, student):
    payment = (
        logged_in(reception)
        .post(
            PAYMENTS,
            {
                "enrollment_id": enrolled.pk,
                "amount_minor": 1_000_000,
                "paid_on": str(date.today()),
                "method": "CASH",
            },
            format="json",
        )
        .data
    )
    logged_in(admin).post(
        f"{PAYMENTS}{payment['public_id']}/reject/",
        {"reason": "Bank slip unreadable"},
        format="json",
    )

    notification = Notification.objects.get(
        recipient=student, kind=NotificationKind.PAYMENT_REJECTED
    )
    assert "unreadable" in notification.message


@pytest.mark.django_db
def test_a_professor_is_told_when_assigned(logged_in, owner, course, professor):
    logged_in(owner).post(
        f"{COURSES}{course.public_id}/professors/",
        {"professor_public_id": professor.public_id},
        format="json",
    )

    assert Notification.objects.filter(
        recipient=professor, kind=NotificationKind.COURSE_ASSIGNED
    ).exists()


@pytest.mark.django_db
def test_a_student_is_told_when_enrolled(logged_in, reception, course, student):
    logged_in(reception).post(
        "/api/v1/enrollments/",
        {"student_public_id": student.public_id, "course_public_id": course.public_id},
        format="json",
    )

    assert Notification.objects.filter(recipient=student, kind=NotificationKind.ENROLLED).exists()


@pytest.mark.django_db
def test_only_marked_students_are_told_marks_are_published(
    logged_in, professor, course, student, enrolled
):
    """Telling someone their result is ready when no mark exists is worse than silence."""
    from apps.assessments.models import Assessment

    CourseProfessor.objects.create(course=course, professor=professor)
    unmarked = make_user("STUDENT", phone="+213555000091")
    Enrollment.objects.create(student=unmarked, course=course, price_at_enrollment_minor=1)

    quiz = Assessment.objects.create(course=course, title="Quiz 1")
    client = logged_in(professor)
    client.put(
        f"/api/v1/assessments/{quiz.pk}/scores/",
        {"rows": [{"student_public_id": student.public_id, "score": "15.00"}]},
        format="json",
    )
    client.post(f"/api/v1/assessments/{quiz.pk}/publish/")

    told = Notification.objects.filter(kind=NotificationKind.MARKS_PUBLISHED)
    assert told.count() == 1
    assert told.first().recipient == student


# --- the session reminder task ----------------------------------------------


@pytest.mark.django_db
def test_session_reminders_carry_the_head_count(course, professor, student, enrolled):
    tomorrow = date.today() + timedelta(days=1)
    CourseProfessor.objects.create(course=course, professor=professor)
    Schedule.objects.create(
        course=course,
        weekday=tomorrow.weekday(),
        start_time="17:00",
        end_time="19:00",
        room="A-102",
    )

    result = send_session_reminders()

    assert result["sent"] == 1
    notification = Notification.objects.get(kind=NotificationKind.SESSION_REMINDER)
    assert notification.recipient == professor
    assert "A-102" in notification.message
    assert "1 student" in notification.message


@pytest.mark.django_db
def test_session_reminders_are_idempotent(course, professor, enrolled):
    """Beat can fire twice after a restart. A duplicate reminder gets it muted."""
    tomorrow = date.today() + timedelta(days=1)
    CourseProfessor.objects.create(course=course, professor=professor)
    Schedule.objects.create(
        course=course, weekday=tomorrow.weekday(), start_time="17:00", end_time="19:00"
    )

    send_session_reminders()
    second = send_session_reminders()

    assert second["sent"] == 0
    assert second["skipped"] == 1
    assert Notification.objects.filter(kind=NotificationKind.SESSION_REMINDER).count() == 1


@pytest.mark.django_db
def test_no_reminder_for_a_course_the_professor_does_not_teach(course, professor):
    tomorrow = date.today() + timedelta(days=1)
    Schedule.objects.create(
        course=course, weekday=tomorrow.weekday(), start_time="17:00", end_time="19:00"
    )

    assert send_session_reminders()["sent"] == 0


# --- reading your own, and only your own ------------------------------------


@pytest.mark.django_db
def test_a_user_sees_only_their_own_notifications(logged_in, student, professor):
    notify(student, NotificationKind.ENROLLED, "Yours", "Body")
    notify(professor, NotificationKind.COURSE_ASSIGNED, "Theirs", "Body")

    response = logged_in(student).get(NOTIFICATIONS)

    assert response.data["count"] == 1
    assert response.data["results"][0]["title"] == "Yours"


@pytest.mark.django_db
def test_another_users_notification_is_not_reachable(logged_in, student, professor):
    theirs = notify(professor, NotificationKind.COURSE_ASSIGNED, "Theirs", "Body")
    assert logged_in(student).get(f"{NOTIFICATIONS}{theirs.pk}/").status_code == 404


@pytest.mark.django_db
def test_marking_read(logged_in, student):
    notification = notify(student, NotificationKind.ENROLLED, "Hello", "Body")
    client = logged_in(student)

    assert client.get(f"{NOTIFICATIONS}unread-count/").data["unread"] == 1
    client.post(f"{NOTIFICATIONS}{notification.pk}/read/")
    assert client.get(f"{NOTIFICATIONS}unread-count/").data["unread"] == 0


@pytest.mark.django_db
def test_mark_all_read_touches_nobody_elses(logged_in, student, professor):
    notify(student, NotificationKind.ENROLLED, "Mine", "Body")
    theirs = notify(professor, NotificationKind.COURSE_ASSIGNED, "Theirs", "Body")

    logged_in(student).post(f"{NOTIFICATIONS}read-all/")

    theirs.refresh_from_db()
    assert theirs.is_read is False


# --- dashboards -------------------------------------------------------------


@pytest.mark.django_db
def test_the_owner_sees_money(logged_in, owner, reception, admin, enrolled):
    payment = (
        logged_in(reception)
        .post(
            PAYMENTS,
            {
                "enrollment_id": enrolled.pk,
                "amount_minor": 2_000_000,
                "paid_on": str(date.today()),
                "method": "CASH",
            },
            format="json",
        )
        .data
    )
    logged_in(admin).post(f"{PAYMENTS}{payment['public_id']}/approve/")

    tiles = logged_in(owner).get(DASHBOARD).data

    assert tiles["revenue_this_month_minor"] == 2_000_000
    assert tiles["outstanding_minor"] == 3_000_000  # 5,000,000 contracted less 2,000,000 paid
    assert tiles["students_total"] >= 1


@pytest.mark.django_db
def test_pending_money_is_not_counted_as_revenue(logged_in, owner, reception, enrolled):
    logged_in(reception).post(
        PAYMENTS,
        {
            "enrollment_id": enrolled.pk,
            "amount_minor": 2_000_000,
            "paid_on": str(date.today()),
            "method": "CASH",
        },
        format="json",
    )

    tiles = logged_in(owner).get(DASHBOARD).data

    assert tiles["revenue_this_month_minor"] == 0
    assert tiles["pending_amount_minor"] == 2_000_000
    assert tiles["pending_count"] == 1


@pytest.mark.django_db
def test_reception_gets_its_queue_and_no_revenue(logged_in, reception, enrolled):
    """A figure the API never sends cannot leak through a screen or a cache."""
    tiles = logged_in(reception).get(DASHBOARD).data

    assert "payments_awaiting_review" in tiles
    assert "revenue_total_minor" not in tiles
    assert "outstanding_minor" not in tiles


@pytest.mark.django_db
def test_a_professor_sees_their_teaching_and_no_money(logged_in, professor, course, enrolled):
    CourseProfessor.objects.create(course=course, professor=professor)

    tiles = logged_in(professor).get(DASHBOARD).data

    assert tiles["my_courses"] == 1
    assert tiles["my_students"] == 1
    assert "revenue_total_minor" not in tiles
    assert "pending_amount_minor" not in tiles


@pytest.mark.django_db
def test_a_professor_dashboard_carries_the_next_session(logged_in, professor, course, enrolled):
    CourseProfessor.objects.create(course=course, professor=professor)
    Schedule.objects.create(
        course=course,
        weekday=(date.today() + timedelta(days=2)).weekday(),
        start_time="17:00",
        end_time="19:00",
        room="A-102",
    )

    tiles = logged_in(professor).get(DASHBOARD).data

    assert tiles["next_session"]["room"] == "A-102"
    assert tiles["next_session"]["enrolled_count"] == 1


@pytest.mark.django_db
def test_a_student_sees_their_own_balance_only(logged_in, student, enrolled, reception, admin):
    payment = (
        logged_in(reception)
        .post(
            PAYMENTS,
            {
                "enrollment_id": enrolled.pk,
                "amount_minor": 1_000_000,
                "paid_on": str(date.today()),
                "method": "CASH",
            },
            format="json",
        )
        .data
    )
    logged_in(admin).post(f"{PAYMENTS}{payment['public_id']}/approve/")

    tiles = logged_in(student).get(DASHBOARD).data

    assert tiles["my_courses"] == 1
    assert tiles["paid_minor"] == 1_000_000
    assert tiles["remaining_minor"] == 4_000_000
    assert "revenue_total_minor" not in tiles
    assert "students_total" not in tiles


@pytest.mark.django_db
def test_anonymous_has_no_dashboard(api):
    assert api.get(DASHBOARD).status_code in (401, 403)


@pytest.mark.django_db
def test_a_deactivated_user_has_no_dashboard(logged_in, student):
    client = logged_in(student)
    student.deactivate()
    assert client.get(DASHBOARD).status_code in (401, 403)
