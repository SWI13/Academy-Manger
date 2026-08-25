"""
Test settings.

Reads the same environment as dev, so the test database is a real PostgreSQL
instance. Tests that matter here - row locks in the identifier allocator,
partial unique constraints, JSONB audit columns - do not behave the same on
SQLite, and a test suite that passes on a database you do not ship is worse
than no test suite.
"""

from .base import *  # noqa: F403

DEBUG = False

# Fast, insecure hashing: the suite creates a lot of users and Argon2 is
# deliberately slow. Production hashing is asserted in its own test.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # noqa: S105

# Two aliases, mirroring base. Keeping them separate here too is the point:
# the autouse `clear_cache` fixture calls cache.clear() between tests, and if
# sessions shared that alias every test would silently log its own client out.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "test",
    },
    "sessions": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "test-sessions",
    },
}
SESSION_ENGINE = "django.contrib.sessions.backends.cache"

# Tasks run inline so a test can assert on their effects without a worker.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
