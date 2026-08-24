"""
Payments.

The most safety-critical tests in the platform. Three properties carry the
weight: separation of duty, terminality, and the fact that a balance is
arithmetic over rows rather than a counter anyone can nudge.
"""

from datetime import date, timedelta

import pytest
from django.core.cache import cache

from apps.courses.models import Course, CourseStatus
from apps.enrollments.models import Enrollment, EnrollmentStatus
from apps.payments.models import Payment, PaymentStatus
from conftest import make_user

PAYMENTS = "/api/v1/payments/"
ENROLLMENTS = "/api/v1/enrollments/"


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
        price_minor=5_000_000,  # 50,000.00 DZD
        status=CourseStatus.ACTIVE,
    )


@pytest.fixture
def enrolled(db, course, student):
    return Enrollment.objects.create(
        student=student,
        course=course,
        price_at_enrollment_minor=course.price_minor,
        currency="DZD",
    )


def payment_body(enrolled, **overrides):
    return {
        "enrollment_id": enrolled.pk,
        "amount_minor": 1_000_000,
        "paid_on": str(date.today()),
        "method": "BANK_TRANSFER",
        **overrides,
    }


def record(client, enrolled, **overrides):
    response = client.post(PAYMENTS, payment_body(enrolled, **overrides), format="json")
    assert response.status_code == 201, response.data
    return Payment.objects.get(public_id=response.data["public_id"])


# --- recording --------------------------------------------------------------


@pytest.mark.django_db
def test_reception_records_a_payment(logged_in, reception, enrolled):
    client = logged_in(reception)
    response = client.post(PAYMENTS, payment_body(enrolled), format="json")

    assert response.status_code == 201
    assert response.data["public_id"].startswith("PAY-")
    assert response.data["status"] == "PENDING"


@pytest.mark.django_db
def test_a_payment_cannot_be_created_already_approved(logged_in, reception, enrolled):
    """Everything starts PENDING; approval is a separate, attributable act."""
    client = logged_in(reception)
    response = client.post(PAYMENTS, payment_body(enrolled, status="APPROVED"), format="json")
    assert response.data["status"] == "PENDING"


@pytest.mark.django_db
def test_a_payment_cannot_be_dated_in_the_future(logged_in, reception, enrolled):
    """A typo here distorts every revenue figure that groups by date."""
    client = logged_in(reception)
    response = client.post(
        PAYMENTS,
        payment_body(enrolled, paid_on=str(date.today() + timedelta(days=1))),
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_a_zero_or_negative_amount_is_refused(logged_in, reception, enrolled):
    client = logged_in(reception)
    for amount in (0, -1000):
        response = client.post(PAYMENTS, payment_body(enrolled, amount_minor=amount), format="json")
        assert response.status_code == 400


@pytest.mark.django_db
def test_cannot_record_against_a_cancelled_enrolment(logged_in, reception, enrolled):
    enrolled.status = EnrollmentStatus.CANCELLED
    enrolled.save(update_fields=["status"])

    client = logged_in(reception)
    response = client.post(PAYMENTS, payment_body(enrolled), format="json")
    assert response.status_code == 400


@pytest.mark.django_db
@pytest.mark.parametrize("actor_fixture", ["professor", "student"])
def test_unauthorised_roles_cannot_record_payments(request, logged_in, enrolled, actor_fixture):
    client = logged_in(request.getfixturevalue(actor_fixture))
    assert client.post(PAYMENTS, payment_body(enrolled), format="json").status_code == 403


# --- separation of duty -----------------------------------------------------


@pytest.mark.django_db
def test_reception_cannot_approve_a_payment(logged_in, reception, enrolled):
    """Whoever takes the money does not confirm it arrived."""
    client = logged_in(reception)
    payment = record(client, enrolled)

    response = client.post(f"{PAYMENTS}{payment.public_id}/approve/")

    assert response.status_code == 403
    payment.refresh_from_db()
    assert payment.status == PaymentStatus.PENDING


@pytest.mark.django_db
def test_an_admin_cannot_approve_their_own_entry(logged_in, admin, enrolled):
    """
    The control is about the pair of people, not about the job title. An admin
    who records a payment is, for that payment, the person who took the money.
    """
    client = logged_in(admin)
    payment = record(client, enrolled)

    response = client.post(f"{PAYMENTS}{payment.public_id}/approve/")

    assert response.status_code == 409
    assert "cannot approve" in str(response.data).lower()
    payment.refresh_from_db()
    assert payment.status == PaymentStatus.PENDING


@pytest.mark.django_db
def test_the_owner_is_not_exempt_from_separation_of_duty(logged_in, owner, enrolled):
    client = logged_in(owner)
    payment = record(client, enrolled)

    assert client.post(f"{PAYMENTS}{payment.public_id}/approve/").status_code == 409


@pytest.mark.django_db
def test_a_second_person_can_approve(logged_in, reception, admin, enrolled):
    payment = record(logged_in(reception), enrolled)

    response = logged_in(admin).post(f"{PAYMENTS}{payment.public_id}/approve/")

    assert response.status_code == 200
    payment.refresh_from_db()
    assert payment.status == PaymentStatus.APPROVED
    assert payment.approved_by == admin
    assert payment.approved_at is not None


# --- terminal states --------------------------------------------------------


@pytest.mark.django_db
def test_an_approved_payment_cannot_be_un_approved(logged_in, reception, admin, enrolled):
    """D-4: approved is terminal. A correction is a new record."""
    payment = record(logged_in(reception), enrolled)
    admin_client = logged_in(admin)
    admin_client.post(f"{PAYMENTS}{payment.public_id}/approve/")

    for endpoint in ("reject", "cancel"):
        response = admin_client.post(
            f"{PAYMENTS}{payment.public_id}/{endpoint}/",
            {"reason": "changed my mind"},
            format="json",
        )
        assert response.status_code == 409

    payment.refresh_from_db()
    assert payment.status == PaymentStatus.APPROVED


@pytest.mark.django_db
def test_a_rejected_payment_cannot_later_be_approved(logged_in, reception, admin, enrolled):
    payment = record(logged_in(reception), enrolled)
    admin_client = logged_in(admin)
    admin_client.post(
        f"{PAYMENTS}{payment.public_id}/reject/", {"reason": "No proof supplied"}, format="json"
    )

    assert admin_client.post(f"{PAYMENTS}{payment.public_id}/approve/").status_code == 409


@pytest.mark.django_db
def test_approving_twice_is_refused(logged_in, reception, admin, enrolled):
    payment = record(logged_in(reception), enrolled)
    admin_client = logged_in(admin)

    assert admin_client.post(f"{PAYMENTS}{payment.public_id}/approve/").status_code == 200
    assert admin_client.post(f"{PAYMENTS}{payment.public_id}/approve/").status_code == 409


@pytest.mark.django_db
def test_payments_cannot_be_edited(logged_in, admin, reception, enrolled):
    payment = record(logged_in(reception), enrolled)
    client = logged_in(admin)

    assert (
        client.patch(
            f"{PAYMENTS}{payment.public_id}/", {"amount_minor": 1}, format="json"
        ).status_code
        == 405
    )


@pytest.mark.django_db
def test_payments_cannot_be_deleted(logged_in, owner, reception, enrolled):
    payment = record(logged_in(reception), enrolled)
    assert logged_in(owner).delete(f"{PAYMENTS}{payment.public_id}/").status_code == 405


# --- rejection needs a reason -----------------------------------------------


@pytest.mark.django_db
def test_rejection_requires_a_reason(logged_in, reception, admin, enrolled):
    """A rejection without a reason is not a decision, it is a shrug."""
    payment = record(logged_in(reception), enrolled)
    admin_client = logged_in(admin)

    assert (
        admin_client.post(f"{PAYMENTS}{payment.public_id}/reject/", {}, format="json").status_code
        == 400
    )
    assert (
        admin_client.post(
            f"{PAYMENTS}{payment.public_id}/reject/", {"reason": "   "}, format="json"
        ).status_code
        == 400
    )


@pytest.mark.django_db
def test_rejection_records_who_when_and_why(logged_in, reception, admin, enrolled):
    payment = record(logged_in(reception), enrolled)

    logged_in(admin).post(
        f"{PAYMENTS}{payment.public_id}/reject/",
        {"reason": "Bank slip does not match the amount"},
        format="json",
    )

    payment.refresh_from_db()
    assert payment.status == PaymentStatus.REJECTED
    assert payment.rejected_by == admin
    assert payment.rejected_at is not None
    assert "does not match" in payment.rejection_reason


# --- cancellation -----------------------------------------------------------


@pytest.mark.django_db
def test_reception_can_cancel_its_own_pending_entry(logged_in, reception, enrolled):
    client = logged_in(reception)
    payment = record(client, enrolled)

    response = client.post(
        f"{PAYMENTS}{payment.public_id}/cancel/", {"reason": "Typed twice"}, format="json"
    )

    assert response.status_code == 200
    payment.refresh_from_db()
    assert payment.status == PaymentStatus.CANCELLED
    assert payment.cancelled_by == reception


@pytest.mark.django_db
def test_reception_cannot_cancel_someone_elses_entry(logged_in, reception, admin, enrolled):
    payment = record(logged_in(admin), enrolled)

    response = logged_in(reception).post(
        f"{PAYMENTS}{payment.public_id}/cancel/", {}, format="json"
    )
    assert response.status_code == 403


# --- balance ----------------------------------------------------------------


@pytest.mark.django_db
def test_balance_counts_only_approved_money(logged_in, reception, admin, enrolled):
    """
    Pending money is reported but never subtracted. Treating a claim as
    received is how an institute discovers at term end that it is short.
    """
    reception_client = logged_in(reception)
    admin_client = logged_in(admin)

    approved = record(reception_client, enrolled, amount_minor=1_000_000)
    admin_client.post(f"{PAYMENTS}{approved.public_id}/approve/")
    record(reception_client, enrolled, amount_minor=1_000_000)  # left pending

    response = admin_client.get(f"{ENROLLMENTS}{enrolled.pk}/balance/")

    assert response.data["total_minor"] == 5_000_000
    assert response.data["paid_minor"] == 1_000_000
    assert response.data["pending_minor"] == 1_000_000
    assert response.data["remaining_minor"] == 4_000_000
    assert response.data["is_settled"] is False


@pytest.mark.django_db
def test_rejected_and_cancelled_money_does_not_count(logged_in, reception, admin, enrolled):
    reception_client = logged_in(reception)
    admin_client = logged_in(admin)

    rejected = record(reception_client, enrolled, amount_minor=2_000_000)
    admin_client.post(
        f"{PAYMENTS}{rejected.public_id}/reject/", {"reason": "Not received"}, format="json"
    )
    cancelled = record(reception_client, enrolled, amount_minor=2_000_000)
    reception_client.post(f"{PAYMENTS}{cancelled.public_id}/cancel/", {}, format="json")

    response = admin_client.get(f"{ENROLLMENTS}{enrolled.pk}/balance/")

    assert response.data["paid_minor"] == 0
    assert response.data["pending_minor"] == 0
    assert response.data["remaining_minor"] == 5_000_000


@pytest.mark.django_db
def test_balance_settles_when_fully_paid(logged_in, reception, admin, enrolled):
    reception_client = logged_in(reception)
    admin_client = logged_in(admin)

    for _ in range(5):
        payment = record(reception_client, enrolled, amount_minor=1_000_000)
        admin_client.post(f"{PAYMENTS}{payment.public_id}/approve/")

    response = admin_client.get(f"{ENROLLMENTS}{enrolled.pk}/balance/")

    assert response.data["paid_minor"] == 5_000_000
    assert response.data["remaining_minor"] == 0
    assert response.data["is_settled"] is True


@pytest.mark.django_db
def test_balance_uses_the_enrolment_price_not_the_current_course_price(
    logged_in, reception, admin, enrolled, course
):
    """The catalogue price moves; what this family owes does not."""
    course.price_minor = 9_000_000
    course.save(update_fields=["price_minor"])

    response = logged_in(admin).get(f"{ENROLLMENTS}{enrolled.pk}/balance/")
    assert response.data["total_minor"] == 5_000_000


# --- scope: a payment history says what a family can afford -----------------


@pytest.mark.django_db
def test_a_student_sees_only_their_own_payments(logged_in, reception, student, enrolled, course):
    other_student = make_user("STUDENT", phone="+213555000071")
    other_enrolment = Enrollment.objects.create(
        student=other_student, course=course, price_at_enrollment_minor=5_000_000
    )
    reception_client = logged_in(reception)
    record(reception_client, enrolled)
    record(reception_client, other_enrolment)

    response = logged_in(student).get(PAYMENTS)

    assert response.data["count"] == 1
    assert response.data["results"][0]["student_public_id"] == student.public_id


@pytest.mark.django_db
def test_a_student_reading_another_payment_gets_404(logged_in, reception, student, course):
    other_student = make_user("STUDENT", phone="+213555000072")
    other_enrolment = Enrollment.objects.create(
        student=other_student, course=course, price_at_enrollment_minor=5_000_000
    )
    theirs = record(logged_in(reception), other_enrolment)

    response = logged_in(student).get(f"{PAYMENTS}{theirs.public_id}/")

    assert response.status_code == 404
    assert response.status_code != 403, "403 would confirm PAY-000001 exists"


@pytest.mark.django_db
def test_a_professor_cannot_reach_payments_at_all(logged_in, professor, enrolled):
    """A professor sees who is in the room, not who has paid."""
    client = logged_in(professor)
    assert client.get(PAYMENTS).status_code == 403


@pytest.mark.django_db
def test_a_student_cannot_approve_their_own_payment(logged_in, reception, student, enrolled):
    payment = record(logged_in(reception), enrolled)
    assert logged_in(student).post(f"{PAYMENTS}{payment.public_id}/approve/").status_code == 403


@pytest.mark.django_db
def test_a_student_cannot_read_another_students_balance(logged_in, student, course):
    other_student = make_user("STUDENT", phone="+213555000073")
    theirs = Enrollment.objects.create(
        student=other_student, course=course, price_at_enrollment_minor=5_000_000
    )
    assert logged_in(student).get(f"{ENROLLMENTS}{theirs.pk}/balance/").status_code == 404


# --- identifiers and history ------------------------------------------------


@pytest.mark.django_db
def test_payment_ids_are_sequential_and_stable(logged_in, reception, enrolled):
    client = logged_in(reception)
    first = record(client, enrolled)
    second = record(client, enrolled)

    assert first.public_id == "PAY-000001"
    assert second.public_id == "PAY-000002"


@pytest.mark.django_db
def test_every_transition_records_an_actor(logged_in, reception, admin, enrolled):
    payment = record(logged_in(reception), enrolled)
    assert payment.created_by == reception

    logged_in(admin).post(f"{PAYMENTS}{payment.public_id}/approve/")
    payment.refresh_from_db()

    assert payment.created_by == reception
    assert payment.approved_by == admin
    assert payment.created_by != payment.approved_by


@pytest.mark.django_db
def test_history_survives_a_deactivated_actor(logged_in, reception, admin, enrolled):
    """
    Staff leave. Their payments must remain readable, and the amount must not
    move because an account was closed.
    """
    payment = record(logged_in(reception), enrolled)
    logged_in(admin).post(f"{PAYMENTS}{payment.public_id}/approve/")

    reception.deactivate()

    payment.refresh_from_db()
    assert payment.status == PaymentStatus.APPROVED
    assert payment.amount_minor == 1_000_000


@pytest.mark.django_db
def test_an_enrolment_with_payments_cannot_be_deleted(enrolled, reception, logged_in):
    """PROTECT: money must stay attributable to a student and a course."""
    from django.db.models import ProtectedError

    record(logged_in(reception), enrolled)

    with pytest.raises(ProtectedError):
        enrolled.delete()


# --- filtering --------------------------------------------------------------


@pytest.mark.django_db
def test_filter_by_status(logged_in, reception, admin, enrolled):
    reception_client = logged_in(reception)
    approved = record(reception_client, enrolled)
    logged_in(admin).post(f"{PAYMENTS}{approved.public_id}/approve/")
    record(reception_client, enrolled)

    response = reception_client.get(PAYMENTS, {"status": "PENDING"})
    assert response.data["count"] == 1


@pytest.mark.django_db
def test_filter_by_date_range(logged_in, reception, enrolled):
    client = logged_in(reception)
    record(client, enrolled, paid_on=str(date.today() - timedelta(days=30)))
    record(client, enrolled, paid_on=str(date.today()))

    response = client.get(
        PAYMENTS, {"from": str(date.today() - timedelta(days=1)), "to": str(date.today())}
    )
    assert response.data["count"] == 1


@pytest.mark.django_db
def test_filter_by_student(logged_in, reception, student, enrolled):
    record(logged_in(reception), enrolled)
    response = logged_in(reception).get(PAYMENTS, {"student": student.public_id})
    assert response.data["count"] == 1
