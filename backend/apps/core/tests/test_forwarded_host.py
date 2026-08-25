"""
Absolute URLs must name the public site, not the container.

Django is reached only through the Next.js BFF, so `request.get_host()` is
`backend:8000` unless the forwarded host is honoured. Every absolute URL
Django builds inherits that - most visibly DRF's pagination `next` and
`previous`, which were being handed to the browser as
`http://backend:8000/api/v1/payments/?page=2`.

Two things wrong with that. It tells the browser the internal hostname and
port, and it is a link the browser cannot follow, so paging simply breaks the
moment a list is longer than one page.
"""

from datetime import date

import pytest

from apps.courses.models import Course, CourseStatus
from apps.enrollments.models import Enrollment
from apps.payments.models import Payment, PaymentStatus

SITE = "localhost:3000"


@pytest.fixture
def two_payments(db, student, reception):
    course = Course.objects.create(
        title="English B2",
        start_date=date(2026, 1, 6),
        end_date=date(2026, 5, 29),
        price_minor=5_000_000,
        status=CourseStatus.ACTIVE,
    )
    enrollment = Enrollment.objects.create(
        student=student, course=course, price_at_enrollment_minor=course.price_minor
    )
    for amount in (100_000, 200_000):
        Payment.objects.create(
            enrollment=enrollment,
            amount_minor=amount,
            paid_on=date(2026, 3, 1),
            method="CASH",
            status=PaymentStatus.PENDING,
            created_by=reception,
        )
    return enrollment


@pytest.mark.django_db
def test_pagination_links_use_the_forwarded_host(logged_in, owner, two_payments):
    response = logged_in(owner).get(
        "/api/v1/payments/?page_size=1", HTTP_X_FORWARDED_HOST=SITE
    )

    assert response.status_code == 200
    assert response.data["next"] is not None
    assert SITE in response.data["next"]
    # The container's own name must not reach the browser.
    assert "backend:8000" not in response.data["next"]


@pytest.mark.django_db
def test_a_forwarded_host_we_do_not_recognise_is_refused(logged_in, owner, two_payments):
    """
    Honouring the header is only safe while ALLOWED_HOSTS still checks it.

    Django is not publicly routed, so in practice nothing but the proxy can
    set this - but "nothing can reach it" is a topology claim, and the host
    check is what makes the setting safe even if that claim stops holding.
    """
    response = logged_in(owner).get(
        "/api/v1/payments/", HTTP_X_FORWARDED_HOST="attacker.example.com"
    )

    assert response.status_code == 400
