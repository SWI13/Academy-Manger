"""
Request metadata for the audit recorder.

The IP address and user agent belong on an audit row, but the service
functions that record actions do not - and should not - take a request. A
Celery task approving a payment has no request at all, and threading one
through every signature to satisfy logging would distort the whole service
layer.

A ContextVar carries it instead. Set by middleware, read by the recorder,
absent when there is no request, and safe under async and threads alike
because each context gets its own copy.
"""

from contextvars import ContextVar
from dataclasses import dataclass

_request_context: ContextVar["RequestContext | None"] = ContextVar(
    "audit_request_context", default=None
)


@dataclass(frozen=True)
class RequestContext:
    ip_address: str | None = None
    user_agent: str = ""


def get_context() -> RequestContext:
    return _request_context.get() or RequestContext()


def set_context(context: RequestContext):
    return _request_context.set(context)


def reset_context(token) -> None:
    _request_context.reset(token)


def _client_ip(request) -> str | None:
    """
    The address Nginx saw, when there is a proxy in front.

    Only the first entry in X-Forwarded-For is taken, and only because the
    deployment terminates TLS at a proxy we control - the header is
    client-settable and would otherwise be trivially spoofed.
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


class AuditContextMiddleware:
    """Puts the request metadata where the recorder can find it."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = set_context(
            RequestContext(
                ip_address=_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:300],
            )
        )
        try:
            return self.get_response(request)
        finally:
            reset_context(token)
