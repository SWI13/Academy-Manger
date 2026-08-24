"""
The audit log.

Two things are being tested: that the actions worth recording actually get
recorded, and that nothing can quietly remove them afterwards. The second is
the one that makes the first worth having.
"""

from datetime import date

import pytest
from django.core.cache import cache
from django.db import DatabaseError, transaction

from apps.audit.models import AuditAction, AuditLog
from apps.audit.services import diff, record
from apps.courses.models import Course, CourseStatus
from apps.enrollments.models import Enrollment

AUDIT = "/api/v1/audit/"
PAYMENTS = "/api/v1/payments/"
USERS = "/api/v1/users/"
COURSES = "/api/v1/courses/"


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def enrolled(db, student):
    course = Course.objects.create(
        title="English B2",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 12, 30),
        price_minor=5_000_000,
        status=CourseStatus.ACTIVE,
    )
    return Enrollment.objects.create(
        student=student, course=course, price_at_enrollment_minor=5_000_000
    )


# --- the log cannot be rewritten -------------------------------------------


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_an_audit_row_cannot_be_updated(owner):
    """
    Enforced by a database trigger, not by application discipline. The actions
    worth recording are exactly the ones someone would want to edit away.
    """
    entry = record(AuditAction.USER_CREATED, actor=owner, obj=owner)
    entry.refresh_from_db()

    with pytest.raises(DatabaseError, match="append-only"), transaction.atomic():
        AuditLog.objects.filter(pk=entry.pk).update(action=AuditAction.LOGIN_FAILED)

    entry.refresh_from_db()
    assert entry.action == AuditAction.USER_CREATED


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_an_audit_row_cannot_be_deleted(owner):
    entry = record(AuditAction.PAYMENT_APPROVED, actor=owner, obj=owner)
    entry.refresh_from_db()

    with pytest.raises(DatabaseError, match="append-only"), transaction.atomic():
        AuditLog.objects.filter(pk=entry.pk).delete()

    assert AuditLog.objects.filter(pk=entry.pk).exists()


@pytest.mark.django_db
def test_the_api_offers_no_way_to_write(logged_in, owner):
    """
    Refused as 403 rather than 405 because the permission layer runs before
    the router - "create" and "destroy" are unmapped, so deny-by-default
    closes them. What matters is that neither reaches the database.
    """
    client = logged_in(owner)
    before = AuditLog.objects.count()

    assert client.post(AUDIT, {"action": "USER_CREATED"}, format="json").status_code in (403, 405)
    assert client.delete(f"{AUDIT}1/").status_code in (403, 405)
    assert AuditLog.objects.count() == before


# --- who may read it --------------------------------------------------------


@pytest.mark.django_db
def test_only_the_owner_can_read_the_audit_log(logged_in, owner):
    assert logged_in(owner).get(AUDIT).status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize("actor_fixture", ["admin", "reception", "professor", "student"])
def test_nobody_else_can_read_the_audit_log(request, logged_in, actor_fixture):
    """An admin cannot read the log that records what they did."""
    client = logged_in(request.getfixturevalue(actor_fixture))
    assert client.get(AUDIT).status_code == 403


@pytest.mark.django_db
def test_anonymous_cannot_read_the_audit_log(api):
    assert api.get(AUDIT).status_code in (401, 403)


# --- what gets recorded -----------------------------------------------------


@pytest.mark.django_db
def test_role_grants_and_revocations_are_recorded(logged_in, owner, reception):
    client = logged_in(owner)
    client.post(f"{USERS}{reception.public_id}/roles/", {"role": "PROFESSOR"}, format="json")
    client.delete(f"{USERS}{reception.public_id}/roles/", {"role": "PROFESSOR"}, format="json")

    actions = list(
        AuditLog.objects.filter(object_id=reception.public_id).values_list("action", flat=True)
    )
    assert AuditAction.ROLE_GRANTED in actions
    assert AuditAction.ROLE_REVOKED in actions


@pytest.mark.django_db
def test_payment_approval_records_both_actors_and_both_values(
    logged_in, reception, admin, enrolled
):
    """The single most audit-worthy action in the platform."""
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

    created = AuditLog.objects.get(action=AuditAction.PAYMENT_CREATED)
    approved = AuditLog.objects.get(action=AuditAction.PAYMENT_APPROVED)

    assert created.actor_public_id == reception.public_id
    assert approved.actor_public_id == admin.public_id
    assert approved.old_values["status"] == "PENDING"
    assert approved.new_values["status"] == "APPROVED"
    assert approved.object_id == payment["public_id"]


@pytest.mark.django_db
def test_a_rejection_records_the_reason(logged_in, reception, admin, enrolled):
    payment = (
        logged_in(reception)
        .post(
            PAYMENTS,
            {
                "enrollment_id": enrolled.pk,
                "amount_minor": 500_000,
                "paid_on": str(date.today()),
                "method": "CASH",
            },
            format="json",
        )
        .data
    )
    logged_in(admin).post(
        f"{PAYMENTS}{payment['public_id']}/reject/",
        {"reason": "Bank slip does not match"},
        format="json",
    )

    entry = AuditLog.objects.get(action=AuditAction.PAYMENT_REJECTED)
    assert "does not match" in entry.new_values["reason"]


@pytest.mark.django_db
def test_user_creation_and_deactivation_are_recorded(logged_in, owner):
    client = logged_in(owner)
    created = client.post(
        USERS,
        {
            "first_name": "Sara",
            "last_name": "Mansouri",
            "primary_role": "STUDENT",
            "phone": "0555987654",
        },
        format="json",
    ).data
    client.post(f"{USERS}{created['public_id']}/status/", {"status": "INACTIVE"}, format="json")

    assert AuditLog.objects.filter(
        action=AuditAction.USER_CREATED, object_id=created["public_id"]
    ).exists()

    status_change = AuditLog.objects.get(action=AuditAction.USER_STATUS_CHANGED)
    assert status_change.old_values["status"] == "ACTIVE"
    assert status_change.new_values["status"] == "INACTIVE"


@pytest.mark.django_db
def test_a_password_reset_is_recorded_without_the_password(logged_in, owner, student):
    logged_in(owner).post(
        "/api/v1/auth/password/reset/", {"public_id": student.public_id}, format="json"
    )

    entry = AuditLog.objects.get(action=AuditAction.PASSWORD_RESET)
    assert entry.actor_public_id == owner.public_id
    # A log that stores the password it reset is worse than no log.
    assert "temporary_password" not in str(entry.new_values)
    assert "password" not in str(entry.new_values).lower()


@pytest.mark.django_db
def test_failed_logins_are_recorded(api, student):
    api.post(
        "/api/v1/auth/login/",
        {"identifier": student.public_id, "password": "wrong"},
        format="json",
    )
    assert AuditLog.objects.filter(action=AuditAction.LOGIN_FAILED).exists()


@pytest.mark.django_db
def test_course_creation_and_archiving_are_recorded(logged_in, owner):
    client = logged_in(owner)
    course = client.post(
        COURSES,
        {
            "title": "French A1",
            "start_date": "2026-09-01",
            "end_date": "2026-12-30",
            "price_minor": 3_000_000,
        },
        format="json",
    ).data
    client.post(f"{COURSES}{course['public_id']}/status/", {"status": "ARCHIVED"}, format="json")

    assert AuditLog.objects.filter(action=AuditAction.COURSE_CREATED).exists()
    archived = AuditLog.objects.get(action=AuditAction.COURSE_STATUS_CHANGED)
    assert archived.new_values["status"] == "ARCHIVED"


@pytest.mark.django_db
def test_who_downloaded_a_families_bank_slip_is_recorded(logged_in, reception, enrolled, student):
    from apps.payments.models import Payment, PaymentProof, ScanStatus

    payment = Payment.objects.create(
        enrollment=enrolled,
        amount_minor=1_000_000,
        paid_on=date.today(),
        method="CASH",
        created_by=reception,
    )
    proof = PaymentProof.objects.create(
        payment=payment,
        storage_key=f"proofs/{payment.public_id}/x.png",
        original_filename="slip.png",
        mime_type="image/png",
        size_bytes=100,
        scan_status=ScanStatus.CLEAN,
    )

    logged_in(reception).get(f"/api/v1/proofs/{proof.pk}/download/")

    assert AuditLog.objects.filter(action=AuditAction.PROOF_DOWNLOADED).exists()


# --- rolled-back work leaves no trace claiming it happened ------------------


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_a_rolled_back_action_records_nothing(owner):
    """
    The row is written on commit. An audit entry for work that was undone is a
    false record, which is worse than a missing one.
    """
    before = AuditLog.objects.count()

    try:
        with transaction.atomic():
            record(AuditAction.PAYMENT_APPROVED, actor=owner, obj=owner)
            raise RuntimeError("something failed after the audit call")
    except RuntimeError:
        pass

    assert AuditLog.objects.count() == before


# --- helpers ----------------------------------------------------------------


def test_diff_reports_only_what_moved():
    """Recording every field on every edit buries the one that changed."""
    old, new = diff(
        {"first_name": "Sara", "phone": "+213555000001"},
        {"first_name": "Sarah", "phone": "+213555000001"},
    )
    assert old == {"first_name": "Sara"}
    assert new == {"first_name": "Sarah"}


@pytest.mark.django_db
def test_secrets_are_never_copied_into_the_log(owner):
    entry = record(
        AuditAction.USER_UPDATED,
        actor=owner,
        obj=owner,
        new={"first_name": "Sara", "password": "hunter2", "token": "abc"},
    )
    entry.refresh_from_db()

    assert entry.new_values == {"first_name": "Sara"}


@pytest.mark.django_db
def test_the_log_survives_a_deleted_actor(owner, student):
    """
    Closing an account must not erase what the person did - and must not fail
    either. With a real foreign key, SET_NULL would issue an UPDATE that the
    append-only trigger refuses, so deleting a user would error out. There is
    no FK: the row keeps who they were at the time.
    """
    entry = record(AuditAction.USER_CREATED, actor=owner, obj=student)
    entry.refresh_from_db()
    owner_public_id, owner_name = owner.public_id, owner.get_full_name()

    owner.delete()

    entry.refresh_from_db()
    assert entry.actor_public_id == owner_public_id
    assert entry.actor_name == owner_name
    assert entry.action == AuditAction.USER_CREATED


# --- reading ----------------------------------------------------------------


@pytest.mark.django_db
def test_the_log_can_be_filtered_by_object(logged_in, owner, reception):
    logged_in(owner).post(
        f"{USERS}{reception.public_id}/roles/", {"role": "PROFESSOR"}, format="json"
    )

    response = logged_in(owner).get(
        AUDIT, {"object_type": "User", "object_id": reception.public_id}
    )
    assert response.data["results"]
    assert all(r["object_id"] == reception.public_id for r in response.data["results"])


@pytest.mark.django_db
def test_the_log_can_be_filtered_by_action(logged_in, owner, reception):
    logged_in(owner).post(
        f"{USERS}{reception.public_id}/roles/", {"role": "PROFESSOR"}, format="json"
    )

    response = logged_in(owner).get(AUDIT, {"action": "ROLE_GRANTED"})
    assert all(r["action"] == "ROLE_GRANTED" for r in response.data["results"])


@pytest.mark.django_db
def test_the_log_is_cursor_paginated(logged_in, owner):
    """Page numbers on an append-only table skip rows as new ones arrive."""
    for _ in range(3):
        record(AuditAction.USER_CREATED, actor=owner, obj=owner)

    response = logged_in(owner).get(AUDIT)
    assert "next" in response.data
    assert "count" not in response.data  # cursor pagination reports no total


@pytest.mark.django_db
def test_the_ip_address_is_captured(api, student):
    api.post(
        "/api/v1/auth/login/",
        {"identifier": student.public_id, "password": "wrong"},
        format="json",
    )
    entry = AuditLog.objects.get(action=AuditAction.LOGIN_FAILED)
    assert entry.ip_address is not None
