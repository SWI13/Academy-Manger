"""
A signed URL must name the host the browser can reach.

Django talks to object storage at `http://minio:9000` on the internal
network. A presigned URL built against that endpoint is signed over that host,
and the browser cannot resolve it - so proof downloads and report exports came
back with a link that failed before it left the machine.

It cannot be fixed by rewriting the host afterwards: SigV4 covers the host
header, so a rewritten URL is an invalid signature. The endpoint has to be
chosen before signing, which is why there are two clients.

The tests running inside the network is exactly why this went unnoticed -
`minio:9000` resolves there.
"""

from urllib.parse import urlparse

from django.conf import settings
from django.test import override_settings

from apps.core import storage


def test_the_two_endpoints_are_configurable_separately():
    assert hasattr(settings, "S3_PUBLIC_ENDPOINT_URL")
    assert hasattr(settings, "S3_ENDPOINT_URL")


@override_settings(
    S3_ENDPOINT_URL="http://minio:9000",
    S3_PUBLIC_ENDPOINT_URL="https://files.example.com",
)
def test_a_download_url_names_the_public_host():
    url = storage.presign_download("exports/x/y.csv", filename="report.csv")

    assert urlparse(url).netloc == "files.example.com"
    # The container's own name must never reach the browser.
    assert "minio:9000" not in url


@override_settings(
    S3_ENDPOINT_URL="http://minio:9000",
    S3_PUBLIC_ENDPOINT_URL="https://files.example.com",
)
def test_an_upload_policy_posts_to_the_public_host():
    policy = storage.presign_upload("proofs/PAY-1/x.png", "image/png")

    assert urlparse(policy["url"]).netloc == "files.example.com"


@override_settings(
    S3_ENDPOINT_URL="http://minio:9000",
    S3_PUBLIC_ENDPOINT_URL="https://files.example.com",
)
def test_server_side_operations_still_use_the_internal_endpoint():
    """
    The split only applies to URLs handed out. Django's own head/put/delete
    must keep using the internal network - routing them through a public
    hostname would send the institute's traffic out and back for no reason.
    """
    assert storage._client().meta.endpoint_url == "http://minio:9000"
    assert storage._signing_client().meta.endpoint_url == "https://files.example.com"


def test_the_default_keeps_a_single_endpoint_working():
    """A deployment with one reachable endpoint needs no extra configuration."""
    assert settings.S3_PUBLIC_ENDPOINT_URL
