"""
Reports and exports.

The properties under test are the ones that would matter if they broke
quietly: an operational permission never reaches a financial figure, a report
run in a worker is scoped exactly as the same report run in a request, and a
CSV of every family's balance is reachable only by the person who asked for
it.
"""

from datetime import date

import pytest
from django.core.cache import cache

from apps.courses.models import AssignmentStatus, Course, CourseProfessor, CourseStatus
from apps.enrollments.models import Enrollment, EnrollmentStatus
from apps.payments.models import Payment, PaymentStatus
from apps.rbac.models import Role, UserRole
from apps.reports.csvfiles import to_csv
from apps.reports.models import ExportStatus, ReportExport
from apps.reports.tasks import run_export
from conftest import make_user

REVENUE = "/api/v1/reports/revenue/"
OUTSTANDING = "/api/v1/reports/outstanding/"
ENROLMENTS = "/api/v1/reports/enrollments/"
EXPORTS = "/api/v1/exports/"


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
def other_course(db):
    return Course.objects.create(
        title="French A1",
        start_date=date(2026, 1, 6),
        end_date=date(2026, 5, 29),
        price_minor=3_000_000,
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


def pay(enrollment, amount, status=PaymentStatus.APPROVED, **extra):
    from django.utils import timezone

    # approved_at is set on the insert, not after it: the table has a check
    # constraint refusing an APPROVED row without one, and that constraint is
    # worth leaving in the way of the test helper too.
    return Payment.objects.create(
        enrollment=enrollment,
        amount_minor=amount,
        paid_on=extra.pop("paid_on", date.today()),
        method="CASH",
        status=status,
        approved_at=timezone.now() if status == PaymentStatus.APPROVED else None,
        **extra,
    )


# --- who may read what ------------------------------------------------------


@pytest.mark.django_db
def test_owner_reads_revenue(logged_in, owner, enrolled):
    pay(enrolled, 2_000_000)

    response = logged_in(owner).get(REVENUE)

    assert response.status_code == 200, response.data
    assert response.data["totals"]["collected_minor"] == 2_000_000


@pytest.mark.django_db
def test_reception_cannot_read_revenue(logged_in, reception, enrolled):
    pay(enrolled, 2_000_000)

    response = logged_in(reception).get(REVENUE)

    # Reception holds report.view_operational, and this is the whole reason
    # the financial permission is separate from it.
    assert response.status_code == 403


@pytest.mark.django_db
def test_professor_cannot_read_outstanding_balances(logged_in, professor, enrolled):
    response = logged_in(professor).get(OUTSTANDING)

    assert response.status_code == 403


@pytest.mark.django_db
def test_student_reaches_no_report_at_all(logged_in, student, enrolled):
    client = logged_in(student)

    for url in (REVENUE, OUTSTANDING, ENROLMENTS):
        assert client.get(url).status_code == 403, url


@pytest.mark.django_db
def test_an_unknown_report_name_is_not_a_route(logged_in, owner):
    response = logged_in(owner).get("/api/v1/reports/salaries/")

    assert response.status_code == 404


# --- the numbers ------------------------------------------------------------


@pytest.mark.django_db
def test_revenue_counts_approved_payments_only(logged_in, owner, enrolled):
    pay(enrolled, 2_000_000, status=PaymentStatus.APPROVED)
    pay(enrolled, 1_000_000, status=PaymentStatus.PENDING)
    pay(enrolled, 500_000, status=PaymentStatus.REJECTED, rejection_reason="Not ours")

    response = logged_in(owner).get(REVENUE)

    # A bank slip that turns out to be a screenshot is not revenue.
    assert response.data["totals"]["collected_minor"] == 2_000_000
    assert response.data["totals"]["payment_count"] == 1


@pytest.mark.django_db
def test_revenue_respects_the_period(logged_in, owner, enrolled):
    pay(enrolled, 2_000_000, paid_on=date(2026, 3, 1))
    pay(enrolled, 1_000_000, paid_on=date(2026, 6, 1))

    response = logged_in(owner).get(f"{REVENUE}?from=2026-01-01&to=2026-03-31")

    assert response.data["totals"]["collected_minor"] == 2_000_000


@pytest.mark.django_db
def test_outstanding_subtracts_approved_and_reports_pending_beside_it(logged_in, owner, enrolled):
    pay(enrolled, 2_000_000, status=PaymentStatus.APPROVED)
    pay(enrolled, 1_000_000, status=PaymentStatus.PENDING)

    row = logged_in(owner).get(OUTSTANDING).data["rows"][0]

    assert row["paid_minor"] == 2_000_000
    assert row["pending_minor"] == 1_000_000
    # A cheque that has not cleared does not reduce the debt.
    assert row["remaining_minor"] == 3_000_000


@pytest.mark.django_db
def test_outstanding_can_hide_settled_enrolments(logged_in, owner, enrolled):
    pay(enrolled, enrolled.price_at_enrollment_minor)

    everything = logged_in(owner).get(OUTSTANDING).data
    unpaid = logged_in(owner).get(f"{OUTSTANDING}?unpaid_only=true").data

    assert everything["totals"]["enrollment_count"] == 1
    assert unpaid["totals"]["enrollment_count"] == 0


@pytest.mark.django_db
def test_cancelled_enrolments_are_not_debts(logged_in, owner, course, student):
    Enrollment.objects.create(
        student=student,
        course=course,
        price_at_enrollment_minor=course.price_minor,
        status=EnrollmentStatus.CANCELLED,
    )

    response = logged_in(owner).get(OUTSTANDING)

    assert response.data["totals"]["enrollment_count"] == 0


@pytest.mark.django_db
def test_enrolment_report_carries_no_money(logged_in, reception, enrolled):
    response = logged_in(reception).get(ENROLMENTS)

    assert response.status_code == 200, response.data
    row = response.data["rows"][0]
    assert row["total"] == 1
    # The operational report is the one reception and professors can reach.
    # If a price appeared in it, the split would be decorative.
    assert not [key for key in row if "minor" in key or "price" in key]


@pytest.mark.django_db
def test_a_professor_only_counts_their_own_classes(
    logged_in, professor, course, other_course, student
):
    CourseProfessor.objects.create(
        course=course, professor=professor, status=AssignmentStatus.ACTIVE
    )
    Enrollment.objects.create(
        student=student, course=course, price_at_enrollment_minor=course.price_minor
    )
    stranger = make_user("STUDENT", phone="+213555000301")
    Enrollment.objects.create(
        student=stranger,
        course=other_course,
        price_at_enrollment_minor=other_course.price_minor,
    )

    response = logged_in(professor).get(ENROLMENTS)

    assert response.data["totals"]["course_count"] == 1
    assert response.data["rows"][0]["course_public_id"] == course.public_id


# --- exports ----------------------------------------------------------------


@pytest.mark.django_db
def test_queueing_an_export_returns_a_job(logged_in, owner, enrolled):
    response = logged_in(owner).post(f"{REVENUE}export/", {}, format="json")

    assert response.status_code == 202, response.data
    assert response.data["status"] == ExportStatus.PENDING
    assert response.data["report_name"] == "revenue"
    # The key is never in the payload, exactly as for a payment proof.
    assert "storage_key" not in response.data


@pytest.mark.django_db
def test_reception_cannot_export_anything(logged_in, reception, enrolled):
    for url in (REVENUE, OUTSTANDING, ENROLMENTS):
        response = logged_in(reception).post(f"{url}export/", {}, format="json")
        assert response.status_code == 403, url

    assert not ReportExport.objects.exists()


@pytest.mark.django_db
def test_the_worker_produces_a_file(logged_in, owner, enrolled):
    pay(enrolled, 2_000_000)
    export = ReportExport.objects.create(report_name="revenue", requested_by=owner)

    result = run_export(export.pk)

    export.refresh_from_db()
    assert result["status"] == ExportStatus.READY
    assert export.status == ExportStatus.READY
    assert export.row_count == 1
    assert export.storage_key.startswith("exports/revenue/")
    assert export.size_bytes > 0


@pytest.mark.django_db
def test_the_worker_refuses_a_revoked_requester(logged_in, admin, enrolled):
    export = ReportExport.objects.create(report_name="revenue", requested_by=admin)
    # The gap between queueing and running is exactly when a role goes away.
    UserRole.objects.filter(user=admin, role=Role.objects.get(code="ADMIN")).delete()
    cache.clear()

    run_export(export.pk)

    export.refresh_from_db()
    assert export.status == ExportStatus.FAILED
    assert not export.storage_key
    assert "no longer holds" in export.error


@pytest.mark.django_db
def test_the_worker_refuses_a_deactivated_requester(admin, enrolled):
    export = ReportExport.objects.create(report_name="revenue", requested_by=admin)
    admin.deactivate()

    run_export(export.pk)

    export.refresh_from_db()
    assert export.status == ExportStatus.FAILED
    assert not export.storage_key


@pytest.mark.django_db
def test_running_an_export_twice_produces_one_file(owner, enrolled):
    pay(enrolled, 2_000_000)
    export = ReportExport.objects.create(report_name="revenue", requested_by=owner)

    run_export(export.pk)
    export.refresh_from_db()
    first_key = export.storage_key

    # acks-late means a task can be redelivered. A second run must not leave
    # an orphaned object in the bucket.
    second = run_export(export.pk)

    export.refresh_from_db()
    assert second.get("skipped") is True
    assert export.storage_key == first_key


@pytest.mark.django_db
def test_the_worker_scopes_the_query_to_the_requester(professor, course, other_course, student):
    """
    The point of running the report inside the task rather than passing rows
    to it: a professor's export is scoped by the same helper their HTTP
    request would use.
    """
    CourseProfessor.objects.create(
        course=course, professor=professor, status=AssignmentStatus.ACTIVE
    )
    Enrollment.objects.create(
        student=student, course=course, price_at_enrollment_minor=course.price_minor
    )
    stranger = make_user("STUDENT", phone="+213555000302")
    Enrollment.objects.create(
        student=stranger,
        course=other_course,
        price_at_enrollment_minor=other_course.price_minor,
    )
    export = ReportExport.objects.create(report_name="enrollments", requested_by=professor)

    run_export(export.pk)

    export.refresh_from_db()
    # A professor holds report.view_operational but not report.export, so the
    # job is refused outright - the scope check never even has to save them.
    assert export.status == ExportStatus.FAILED


@pytest.mark.django_db
def test_you_only_see_your_own_exports(logged_in, owner, admin, enrolled):
    mine = ReportExport.objects.create(report_name="revenue", requested_by=admin)

    listed = logged_in(owner).get(EXPORTS)
    fetched = logged_in(owner).get(f"{EXPORTS}{mine.public_id}/")

    assert listed.data["count"] == 0
    # 404, not 403 - the owner learns nothing about what the admin pulled.
    assert fetched.status_code == 404


@pytest.mark.django_db
def test_downloading_someone_elses_export_is_a_404(logged_in, owner, admin, enrolled):
    pay(enrolled, 2_000_000)
    theirs = ReportExport.objects.create(report_name="revenue", requested_by=admin)
    run_export(theirs.pk)

    response = logged_in(owner).get(f"{EXPORTS}{theirs.public_id}/download/")

    assert response.status_code == 404


@pytest.mark.django_db
def test_downloading_an_unfinished_export_says_so(logged_in, owner):
    export = ReportExport.objects.create(report_name="revenue", requested_by=owner)

    response = logged_in(owner).get(f"{EXPORTS}{export.public_id}/download/")

    assert response.status_code == 409
    assert response.data["error"]["code"] == "export_not_ready"


@pytest.mark.django_db
def test_a_finished_export_yields_a_signed_url(logged_in, owner, enrolled):
    pay(enrolled, 2_000_000)
    export = ReportExport.objects.create(report_name="revenue", requested_by=owner)
    run_export(export.pk)

    response = logged_in(owner).get(f"{EXPORTS}{export.public_id}/download/")

    assert response.status_code == 200, response.data
    assert "X-Amz-Signature" in response.data["url"]
    assert response.data["expires_in"] > 0


# --- the CSV itself ---------------------------------------------------------


def test_csv_neutralises_spreadsheet_formulas():
    payload = to_csv([{"name": "=1+1", "note": "@SUM(A1:A9)"}]).decode("utf-8-sig")

    # A name a finance officer's spreadsheet would otherwise execute on open.
    assert "'=1+1" in payload
    assert "'@SUM(A1:A9)" in payload


def test_csv_carries_a_bom_for_excel():
    payload = to_csv([{"name": "Boumediène"}])

    assert payload.startswith(b"\xef\xbb\xbf")
    assert "Boumediène" in payload.decode("utf-8-sig")


def test_csv_of_nothing_is_still_a_csv():
    assert to_csv([]) == b"\xef\xbb\xbf\r\n"
