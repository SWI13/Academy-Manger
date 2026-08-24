"""
E.164 normalisation.

SMS is planned for students and professors. Every one of these cases is a
message that either arrives or silently does not.
"""

import pytest
from django.core.exceptions import ValidationError

from apps.core.phone import normalize_phone, validate_e164


@pytest.mark.parametrize(
    ("typed", "stored"),
    [
        ("0555123456", "+213555123456"),  # what reception actually types
        ("05 55 12 34 56", "+213555123456"),  # with the spaces they use
        ("05-55-12-34-56", "+213555123456"),
        ("+213555123456", "+213555123456"),  # already international
        ("00213555123456", "+213555123456"),  # international prefix instead of +
        ("0770123456", "+213770123456"),  # a different Algerian carrier
    ],
)
def test_local_input_is_stored_as_e164(typed, stored):
    assert normalize_phone(typed) == stored


@pytest.mark.parametrize("empty", [None, "", "   "])
def test_absent_phone_is_none_never_empty_string(empty):
    """An empty string is a value and would collide on the unique index."""
    assert normalize_phone(empty) is None


@pytest.mark.parametrize("bad", ["12345", "abcdefg", "0555", "+999999999999999"])
def test_unusable_numbers_are_rejected_at_the_door(bad):
    with pytest.raises(ValidationError):
        normalize_phone(bad)


def test_region_can_be_overridden():
    """The default region is a setting, not an assumption baked into the code."""
    assert normalize_phone("07400 123456", region="GB") == "+447400123456"


def test_validator_accepts_stored_e164():
    assert validate_e164("+213555123456") is None


@pytest.mark.parametrize("bad", ["0555123456", "213555123456", "+12345"])
def test_validator_rejects_anything_not_e164(bad):
    """Catches numbers arriving by fixture, data migration or shell."""
    with pytest.raises(ValidationError):
        validate_e164(bad)


def test_validator_ignores_empty_because_phone_is_optional():
    assert validate_e164("") is None
