"""
One error shape for the whole API.

    {"error": {"code": "...", "message": "...", "details": {...}}}

The frontend writes one branch instead of one per status code, and error text
never leaks internals: unhandled exceptions become a generic 500 while the real
traceback goes to the logs.
"""

import logging

from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)

_CODES = {
    status.HTTP_400_BAD_REQUEST: "validation_error",
    status.HTTP_401_UNAUTHORIZED: "not_authenticated",
    status.HTTP_403_FORBIDDEN: "permission_denied",
    status.HTTP_404_NOT_FOUND: "not_found",
    status.HTTP_405_METHOD_NOT_ALLOWED: "method_not_allowed",
    status.HTTP_409_CONFLICT: "conflict",
    status.HTTP_429_TOO_MANY_REQUESTS: "throttled",
}


class ConflictError(exceptions.APIException):
    """A valid request that the current state of the system refuses."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "The request conflicts with the current state of the resource."
    default_code = "conflict"


def api_exception_handler(exc, context):
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied()

    response = drf_exception_handler(exc, context)

    if response is None:
        # Nothing DRF recognises: an unhandled bug. Log it with the traceback,
        # return nothing useful to the caller.
        logger.exception("Unhandled exception in %s", context.get("view"))
        return Response(
            {
                "error": {
                    "code": "internal_error",
                    "message": "An unexpected error occurred.",
                    "details": {},
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    detail = response.data
    code = _CODES.get(response.status_code, "error")

    if isinstance(detail, dict) and "detail" in detail:
        message = str(detail["detail"])
        details = {}
    elif isinstance(detail, dict):
        # Serializer validation: {"field": ["message", ...]}
        message = "The submitted data is not valid."
        details = detail
    else:
        message = "The request could not be processed."
        details = {"errors": detail}

    response.data = {"error": {"code": code, "message": message, "details": details}}
    return response
