"""
Login throttling.

Two throttles, because they stop different attacks:

  by IP       one machine trying many accounts (spraying)
  by account  many machines trying one account (targeted brute force)

An IP-only throttle is defeated by a botnet against a single account; an
account-only throttle is defeated by trying one password against every account.
Both are cheap.
"""

from rest_framework.throttling import SimpleRateThrottle


class LoginIPThrottle(SimpleRateThrottle):
    """Caps attempts from one source address, whichever account is targeted."""

    scope = "login"

    def get_cache_key(self, request, view):
        return f"throttle:login:ip:{self.get_ident(request)}"


class LoginIdentifierThrottle(SimpleRateThrottle):
    """
    Caps attempts against one account, wherever they come from.

    Keyed on what was submitted rather than on a resolved user, so an attacker
    cannot learn whether an account exists by watching for the throttle.
    """

    scope = "login"

    def get_cache_key(self, request, view):
        identifier = (request.data.get("identifier") or "").strip().lower()
        if not identifier:
            return None  # nothing to key on; the IP throttle still applies
        return f"throttle:login:id:{identifier}"
