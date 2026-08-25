"""Local development. Never used for staging or production."""

from .base import *  # noqa: F403

DEBUG = True
# "localhost" covers the forwarded host the BFF sends (localhost:3000);
# the port is not part of the ALLOWED_HOSTS comparison.
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "backend", "0.0.0.0"]  # noqa: S104

INSTALLED_APPS += ["django_extensions"]  # noqa: F405

# Cookies are not sent over TLS locally, so these must stay off here and
# on in prod.py. They are never set from an environment variable, because a
# missing variable in production would silently disable them.
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
