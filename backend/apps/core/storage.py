"""
Private object storage.

Django's job is to decide whether a transfer is allowed and sign a short-lived
URL for it. The bytes go browser <-> bucket directly. Routing a 15 MB scan
through gunicorn occupies a worker for the whole upload on an institute's
uplink, and a handful of concurrent uploads saturates the pool.

The bucket is never public. A student photo or a scanned birth certificate
reachable by guessable URL is a safeguarding incident, not a caching
optimisation, so every read is signed too.
"""

import hashlib
import logging
import uuid
from dataclasses import dataclass

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from django.conf import settings

logger = logging.getLogger(__name__)

# What a payment proof may be. Anything else is refused before a URL is signed.
ALLOWED_PROOF_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "application/pdf": ".pdf",
}

MAX_PROOF_BYTES = 10 * 1024 * 1024  # 10 MB - a phone photo of a bank slip


class StorageError(Exception):
    """Object storage is unreachable or refused the operation."""


@dataclass(frozen=True)
class ObjectInfo:
    key: str
    size_bytes: int
    content_type: str
    etag: str


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
        # SigV4 so presigned URLs work against MinIO and real S3 alike.
        config=Config(signature_version="s3v4"),
    )


def build_proof_key(payment_public_id: str, content_type: str) -> str:
    """
    An unguessable key, namespaced by payment.

    The random component matters even though the bucket is private: a key that
    is derivable from a payment ID is one signing bug away from being a
    directory listing.
    """
    extension = ALLOWED_PROOF_TYPES.get(content_type, "")
    return f"proofs/{payment_public_id}/{uuid.uuid4().hex}{extension}"


def presign_upload(key: str, content_type: str, *, max_bytes: int = MAX_PROOF_BYTES) -> dict:
    """
    A short-lived POST policy the browser uploads straight to.

    Content type and a size ceiling are bound into the signature, so the
    signature is not a blank cheque: an oversized or mistyped upload is
    refused by the storage service itself, before it reaches us.
    """
    try:
        return _client().generate_presigned_post(
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            Fields={"Content-Type": content_type},
            Conditions=[
                {"Content-Type": content_type},
                ["content-length-range", 1, max_bytes],
            ],
            ExpiresIn=settings.S3_UPLOAD_URL_TTL,
        )
    except ClientError as exc:
        logger.exception("Could not sign upload for %s", key)
        raise StorageError("Could not prepare the upload.") from exc


def presign_download(key: str, *, filename: str | None = None) -> str:
    """A single-use-ish signed GET. Seconds, not hours - these are private files."""
    params = {"Bucket": settings.S3_BUCKET_NAME, "Key": key}
    if filename:
        params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'
    try:
        return _client().generate_presigned_url(
            "get_object", Params=params, ExpiresIn=settings.S3_DOWNLOAD_URL_TTL
        )
    except ClientError as exc:
        logger.exception("Could not sign download for %s", key)
        raise StorageError("Could not prepare the download.") from exc


def head_object(key: str) -> ObjectInfo | None:
    """
    Confirm the object really is there, and what it actually is.

    The client telling us it uploaded something is not evidence that it did.
    Without this check a caller can create a proof row pointing at nothing, or
    at a 400 MB file they claimed was 2 KB.
    """
    try:
        response = _client().head_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        logger.exception("HEAD failed for %s", key)
        raise StorageError("Could not verify the uploaded file.") from exc

    return ObjectInfo(
        key=key,
        size_bytes=response["ContentLength"],
        content_type=response.get("ContentType", ""),
        etag=response.get("ETag", "").strip('"'),
    )


def delete_object(key: str) -> None:
    """Only for cleaning up an upload that never became a proof row."""
    try:
        _client().delete_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    except ClientError:
        logger.warning("Could not delete orphaned object %s", key, exc_info=True)


def checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
