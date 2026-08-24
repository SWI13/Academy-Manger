"""
Phone numbers are stored in E.164 and nothing else.

SMS is not in the MVP, but it is coming for both students and professors. That
makes the storage format a decision to get right now rather than later: an SMS
gateway cannot dial "0555123456", and rewriting a live user table into E.164
means a data migration plus manual review of every number that fails to parse.
Normalising on the way in costs nothing today.

Reception staff will type the local form. They should not have to think about
country codes, so the local form is accepted and converted.

    "0555123456"      -> "+213555123456"
    "05 55 12 34 56"  -> "+213555123456"
    "+213555123456"   -> "+213555123456"
"""

import phonenumbers
from django.conf import settings
from django.core.exceptions import ValidationError

E164_MAX_LENGTH = 16  # "+" plus at most 15 digits


def normalize_phone(raw: str | None, *, region: str | None = None) -> str | None:
    """
    Return `raw` in E.164, or None if it is empty.

    Empty means None, never "" - an empty string is a value, and with a unique
    index the second user without a phone would collide on it.

    Raises ValidationError if the number cannot be parsed or is not a real
    number for the region. Rejecting at the door beats discovering it when a
    fee reminder silently fails to send.
    """
    if raw is None:
        return None

    raw = str(raw).strip()
    if not raw:
        return None

    region = region or settings.DEFAULT_PHONE_REGION

    try:
        parsed = phonenumbers.parse(raw, region)
    except phonenumbers.NumberParseException as exc:
        raise ValidationError(
            {"phone": "Enter a valid phone number, for example 0555123456."}
        ) from exc

    if not phonenumbers.is_valid_number(parsed):
        raise ValidationError(
            {"phone": "That phone number is not valid. Check the digits and try again."}
        )

    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def validate_e164(value: str) -> None:
    """
    Model-level guard that stored values really are E.164.

    `normalize_phone` is the way numbers should enter the system; this catches
    anything that arrives by another route - a fixture, a data migration, a
    shell session.
    """
    if not value:
        return
    if not value.startswith("+"):
        raise ValidationError("Phone numbers must be stored in E.164 form, starting with +.")
    try:
        parsed = phonenumbers.parse(value, None)
    except phonenumbers.NumberParseException as exc:
        raise ValidationError("Phone numbers must be stored in E.164 form.") from exc
    if not phonenumbers.is_valid_number(parsed):
        raise ValidationError("That phone number is not a valid number.")
