"""
Production.

Staging imports this module and overrides only what must differ, so staging
exercises the production security posture rather than a softer copy of it.
"""

from .base import *  # noqa: F403

DEBUG = False

# Hardcoded, not environment-driven: a missing or mistyped variable must not
# be able to turn TLS-only cookies off in production.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# The API returns JSON to a server-side caller. It has no reason to render
# a browsable HTML page, and that page is an XSS surface.
REST_FRAMEWORK = {  # noqa: F405
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}
