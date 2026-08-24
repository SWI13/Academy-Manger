"""
Payment proofs.

These run against the real object store, not a mock. The whole point of the
design is that Django never sees the bytes, so a test that stubs the storage
layer would be testing the opposite of what ships.
"""

from datetime import date

import boto3
import pytest
from botocore.client import Config
from django.conf import settings
from django.core.cache import cache

from apps.core import storage
from apps.courses.models import Course, CourseStatus
from apps.enrollments.models import Enrollment
from apps.payments.models import Payment, PaymentProof, ScanStatus
from conftest import make_user

PAYMENTS = "/api/v1/payments/"
PROOFS = "/api/v1/proofs/"

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05"
    b"\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def s3():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
        config=Config(signature_version="s3v4"),
    )


@pytest.fixture
def payment(db, student, reception):
    course = Course.objects.create(
        title="English B2",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 12, 30),
        price_minor=5_000_000,
        status=CourseStatus.ACTIVE,
    )
    enrollment = Enrollment.objects.create(
        student=student, course=course, price_at_enrollment_minor=5_000_000
    )
    return Payment.objects.create(
        enrollment=enrollment,
        amount_minor=1_000_000,
        paid_on=date.today(),
        method="BANK_TRANSFER",
        created_by=reception,
    )


def upload_directly(s3, key, data=PNG_BYTES, content_type="image/png"):
    """Stands in for the browser PUT that never touches Django."""
    s3.put_object(Bucket=settings.S3_BUCKET_NAME, Key=key, Body=data, ContentType=content_type)


# --- signing ----------------------------------------------------------------


@pytest.mark.django_db
def test_upload_url_is_issued_without_any_bytes(logged_in, reception, payment):
    client = logged_in(reception)
    response = client.post(
        f"{PAYMENTS}{payment.public_id}/proofs/upload-url/",
        {"filename": "slip.png", "content_type": "image/png", "size_bytes": len(PNG_BYTES)},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["storage_key"].startswith(f"proofs/{payment.public_id}/")
    assert "url" in response.data["upload"]


@pytest.mark.django_db
def test_the_key_is_not_guessable_from_the_payment_id(logged_in, reception, payment):
    """Private bucket or not, a derivable key is one signing bug from a listing."""
    client = logged_in(reception)
    keys = {
        client.post(
            f"{PAYMENTS}{payment.public_id}/proofs/upload-url/",
            {"filename": "a.png", "content_type": "image/png", "size_bytes": 100},
            format="json",
        ).data["storage_key"]
        for _ in range(3)
    }
    assert len(keys) == 3


@pytest.mark.django_db
def test_an_unsupported_content_type_is_refused_before_signing(logged_in, reception, payment):
    client = logged_in(reception)
    response = client.post(
        f"{PAYMENTS}{payment.public_id}/proofs/upload-url/",
        {"filename": "payload.exe", "content_type": "application/x-msdownload", "size_bytes": 10},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_an_oversized_upload_is_refused_before_signing(logged_in, reception, payment):
    client = logged_in(reception)
    response = client.post(
        f"{PAYMENTS}{payment.public_id}/proofs/upload-url/",
        {
            "filename": "huge.pdf",
            "content_type": "application/pdf",
            "size_bytes": storage.MAX_PROOF_BYTES + 1,
        },
        format="json",
    )
    assert response.status_code == 400


# --- confirmation is verified, not trusted ----------------------------------


@pytest.mark.django_db
def test_confirming_a_real_upload_creates_the_proof(logged_in, reception, payment, s3):
    client = logged_in(reception)
    key = client.post(
        f"{PAYMENTS}{payment.public_id}/proofs/upload-url/",
        {"filename": "slip.png", "content_type": "image/png", "size_bytes": len(PNG_BYTES)},
        format="json",
    ).data["storage_key"]

    upload_directly(s3, key)

    response = client.post(
        f"{PAYMENTS}{payment.public_id}/proofs/confirm/",
        {"storage_key": key, "filename": "slip.png"},
        format="json",
    )

    assert response.status_code == 201
    proof = PaymentProof.objects.get(storage_key=key)
    # Size and type come from the object itself, not from what was claimed.
    assert proof.size_bytes == len(PNG_BYTES)
    assert proof.mime_type == "image/png"


@pytest.mark.django_db
def test_confirming_without_uploading_is_refused(logged_in, reception, payment):
    """The client saying it uploaded is not evidence that it did."""
    client = logged_in(reception)
    key = client.post(
        f"{PAYMENTS}{payment.public_id}/proofs/upload-url/",
        {"filename": "slip.png", "content_type": "image/png", "size_bytes": 100},
        format="json",
    ).data["storage_key"]

    response = client.post(
        f"{PAYMENTS}{payment.public_id}/proofs/confirm/",
        {"storage_key": key, "filename": "slip.png"},
        format="json",
    )

    assert response.status_code == 400
    assert PaymentProof.objects.count() == 0


@pytest.mark.django_db
def test_a_key_from_another_payment_cannot_be_attached(logged_in, reception, payment, s3):
    """Otherwise a caller attaches someone else's file to their own payment."""
    foreign_key = "proofs/PAY-999999/deadbeef.png"
    upload_directly(s3, foreign_key)

    client = logged_in(reception)
    response = client.post(
        f"{PAYMENTS}{payment.public_id}/proofs/confirm/",
        {"storage_key": foreign_key, "filename": "stolen.png"},
        format="json",
    )

    assert response.status_code == 403
    assert PaymentProof.objects.count() == 0


@pytest.mark.django_db
def test_a_file_whose_real_type_is_wrong_is_rejected_and_removed(logged_in, reception, payment, s3):
    """
    The declared type was image/png; what actually landed is not. Trusting the
    declaration would let an executable sit in the bucket labelled as an image.
    """
    client = logged_in(reception)
    key = client.post(
        f"{PAYMENTS}{payment.public_id}/proofs/upload-url/",
        {"filename": "slip.png", "content_type": "image/png", "size_bytes": 100},
        format="json",
    ).data["storage_key"]

    upload_directly(s3, key, data=b"MZ\x90\x00", content_type="application/x-msdownload")

    response = client.post(
        f"{PAYMENTS}{payment.public_id}/proofs/confirm/",
        {"storage_key": key, "filename": "slip.png"},
        format="json",
    )

    assert response.status_code == 400
    assert PaymentProof.objects.count() == 0
    assert storage.head_object(key) is None, "the rejected object was left in the bucket"


# --- download ---------------------------------------------------------------


@pytest.fixture
def uploaded_proof(logged_in, reception, payment, s3):
    client = logged_in(reception)
    key = client.post(
        f"{PAYMENTS}{payment.public_id}/proofs/upload-url/",
        {"filename": "slip.png", "content_type": "image/png", "size_bytes": len(PNG_BYTES)},
        format="json",
    ).data["storage_key"]
    upload_directly(s3, key)
    client.post(
        f"{PAYMENTS}{payment.public_id}/proofs/confirm/",
        {"storage_key": key, "filename": "slip.png"},
        format="json",
    )
    return PaymentProof.objects.get(storage_key=key)


@pytest.mark.django_db
def test_an_unscanned_proof_is_not_downloadable(logged_in, reception, uploaded_proof):
    """Handing out a signed URL before the scan defeats the scan."""
    assert uploaded_proof.scan_status == ScanStatus.PENDING

    response = logged_in(reception).get(f"{PROOFS}{uploaded_proof.pk}/download/")
    assert response.status_code == 409


@pytest.mark.django_db
def test_a_clean_proof_yields_a_signed_url(logged_in, reception, uploaded_proof):
    client = logged_in(reception)
    client.post(f"{PROOFS}{uploaded_proof.pk}/scanned/")

    response = client.get(f"{PROOFS}{uploaded_proof.pk}/download/")

    assert response.status_code == 200
    assert "X-Amz-Signature" in response.data["url"]
    assert response.data["expires_in"] == settings.S3_DOWNLOAD_URL_TTL


@pytest.mark.django_db
def test_the_storage_key_is_never_exposed(logged_in, reception, payment, uploaded_proof):
    """The only route to the bytes is a URL this API signs."""
    response = logged_in(reception).get(f"{PAYMENTS}{payment.public_id}/proofs/")
    assert "storage_key" not in str(response.data)


# --- scope ------------------------------------------------------------------


@pytest.mark.django_db
def test_a_student_cannot_download_another_students_proof(
    logged_in, reception, student, uploaded_proof
):
    other = make_user("STUDENT", phone="+213555000081")
    logged_in(reception).post(f"{PROOFS}{uploaded_proof.pk}/scanned/")

    response = logged_in(other).get(f"{PROOFS}{uploaded_proof.pk}/download/")

    assert response.status_code == 404
    assert response.status_code != 403


@pytest.mark.django_db
def test_a_student_can_download_their_own_proof(logged_in, reception, student, uploaded_proof):
    logged_in(reception).post(f"{PROOFS}{uploaded_proof.pk}/scanned/")

    response = logged_in(student).get(f"{PROOFS}{uploaded_proof.pk}/download/")
    assert response.status_code == 200


@pytest.mark.django_db
def test_a_professor_cannot_reach_proofs(logged_in, professor, uploaded_proof):
    response = logged_in(professor).get(f"{PROOFS}{uploaded_proof.pk}/download/")
    assert response.status_code == 403


# --- the bucket is private --------------------------------------------------


@pytest.mark.django_db
def test_the_object_is_not_publicly_readable(uploaded_proof):
    """
    An unsigned request must fail. A student photo or bank slip reachable by
    guessable URL is a safeguarding incident, not a caching optimisation.
    """
    import urllib.error
    import urllib.request

    url = f"{settings.S3_ENDPOINT_URL}/{settings.S3_BUCKET_NAME}/{uploaded_proof.storage_key}"
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(url, timeout=10)  # noqa: S310 - fixed internal scheme

    assert exc.value.code in (401, 403)
