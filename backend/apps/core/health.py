"""
Liveness/readiness endpoint.

Deliberately says nothing beyond up or down per dependency: version strings,
hostnames and error text are reconnaissance, and this is the one unauthenticated
route in the API.
"""

from django.core.cache import cache
from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


def _check_database() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            return cursor.fetchone() == (1,)
    except Exception:  # noqa: BLE001 - any failure is a failed check
        return False


def _check_cache() -> bool:
    try:
        cache.set("health:ping", "pong", timeout=5)
        return cache.get("health:ping") == "pong"
    except Exception:  # noqa: BLE001
        return False


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health_view(request):
    checks = {"database": _check_database(), "cache": _check_cache()}
    healthy = all(checks.values())

    return Response(
        {
            "status": "ok" if healthy else "degraded",
            **{name: ("ok" if ok else "fail") for name, ok in checks.items()},
        },
        status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
    )
