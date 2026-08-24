"""
Staging: production settings, anonymised data.

Production data never reaches this environment. The anonymisation task and the
refresh runbook land in Phase 19; until then staging is seeded with fixtures.
"""

from .prod import *  # noqa: F403

# Staging often sits behind a self-signed or internal certificate.
SECURE_HSTS_SECONDS = 0
SECURE_HSTS_PRELOAD = False
