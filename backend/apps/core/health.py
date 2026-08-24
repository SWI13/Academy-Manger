"""
Liveness/readiness endpoint.

Deliberately says nothing beyond up or down per dependency: version strings,
hostnames and error text are reconnaissance, and this is the one unauthenticated
route in the API.
"""

from django.core.cache import cache
from django.db import connection
from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

_STATE = {"type": "string", "enum": ["ok", "fail"]}
_HEALTH_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["ok", "degraded"]},
        "database": _STATE,
        "cache": _STATE,
    },
    "required": ["status", "database", "cache"],
}


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


@extend_schema(
    summary="Liveness and dependency check",
    description=(
        "Reports whether the API can reach PostgreSQL and Redis. "
        "The only unauthenticated route in the API, so it deliberately "
        "returns no version, hostname or error detail."
    ),
    auth=[],
    responses={200: _HEALTH_SCHEMA, 503: _HEALTH_SCHEMA},
    examples=[
        OpenApiExample(
            "Healthy",
            value={"status": "ok", "database": "ok", "cache": "ok"},
            response_only=True,
            status_codes=["200"],
        ),
        OpenApiExample(
            "Database unreachable",
            value={"status": "degraded", "database": "fail", "cache": "ok"},
            response_only=True,
            status_codes=["503"],
        ),
    ],
)
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
