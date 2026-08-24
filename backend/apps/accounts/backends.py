"""
Authentication backend: log in with a User ID or a phone number.

Staff read identifiers aloud - "STU-000123" - and students remember their
phone. Both are unique, so either works as a username.
"""

import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.core.exceptions import ValidationError
from django.db.models import Q

from apps.core.phone import normalize_phone

logger = logging.getLogger(__name__)
User = get_user_model()


class PublicIdOrPhoneBackend(ModelBackend):
    """
    Resolves the identifier, then defers to ModelBackend for everything else -
    password verification, hash upgrading, and the is_active check.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        identifier = username or kwargs.get(User.USERNAME_FIELD)
        if identifier is None or password is None:
            return None

        identifier = identifier.strip()
        lookup = Q(public_id__iexact=identifier)

        # A phone typed in local form must match the number stored in E.164.
        try:
            as_phone = normalize_phone(identifier)
        except ValidationError:
            as_phone = None
        if as_phone:
            lookup |= Q(phone=as_phone)

        try:
            user = User.objects.get(lookup)
        except User.DoesNotExist:
            # Run the hasher anyway. Without this, a missing account returns
            # measurably faster than a wrong password, which turns login into
            # an oracle for which User IDs exist.
            User().set_password(password)
            return None
        except User.MultipleObjectsReturned:
            # public_id and phone are both unique, so this means one user's
            # public_id equals another's phone. Refuse rather than guess.
            logger.error("Ambiguous login identifier %r matched multiple users", identifier)
            return None

        if not user.check_password(password):
            return None
        if not self.user_can_authenticate(user):
            # Inactive or suspended. Same generic failure as a wrong password:
            # whether an account exists is not something a caller needs to learn.
            logger.info("Login refused for inactive account %s", user.public_id)
            return None

        return user
