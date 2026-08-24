"""
Human-readable identifier allocation: STU-000001, PROF-000021, C-2026-001.

These are the numbers staff read aloud over the phone, so they must be stable,
unique and gap-free-ish. `MAX(public_id) + 1` is not an option: two
receptionists creating a student in the same second would both compute
STU-000123 and one insert would fail - or worse, in a system without the unique
constraint, both would succeed.

`SELECT ... FOR UPDATE` on a single counter row serialises allocation.
"""

from django.db import IntegrityError, transaction

from .enums import RoleCode
from .models import IdentifierSequence

# Prefixes for the roles defined in the architecture. Course identifiers are
# year-scoped and built by `next_course_identifier` instead.
ROLE_PREFIXES = {
    RoleCode.OWNER: "OWN",
    RoleCode.ADMIN: "ADMIN",
    RoleCode.RECEPTION: "REC",
    RoleCode.PROFESSOR: "PROF",
    RoleCode.STUDENT: "STU",
}


def _ensure_row(key: str) -> None:
    """
    Create the counter row if it is missing.

    Wrapped in its own atomic block so that losing the create race raises an
    IntegrityError we can swallow, without marking an enclosing transaction as
    needing rollback.
    """
    if IdentifierSequence.objects.filter(key=key).exists():
        return
    try:
        with transaction.atomic():
            IdentifierSequence.objects.create(key=key, current_value=0)
    except IntegrityError:
        pass  # another process created it first, which is the outcome we wanted


def next_identifier(key: str, *, prefix: str | None = None, width: int = 6) -> str:
    """
    Allocate the next identifier for `key` and return it formatted.

        next_identifier("STU")                       -> "STU-000001"
        next_identifier("C-2026", width=3)           -> "C-2026-001"

    Safe to call inside a larger transaction; the row lock is held until that
    transaction commits.
    """
    prefix = prefix or key
    _ensure_row(key)

    with transaction.atomic():
        row = IdentifierSequence.objects.select_for_update().get(key=key)
        row.current_value += 1
        row.save(update_fields=["current_value"])
        value = row.current_value

    return f"{prefix}-{value:0{width}d}"


def next_user_identifier(role_code: str) -> str:
    """STU-000001 for a student, PROF-000021 for a professor, and so on."""
    try:
        prefix = ROLE_PREFIXES[role_code]
    except KeyError:
        raise ValueError(f"No identifier prefix defined for role {role_code!r}") from None
    return next_identifier(prefix, width=6)


def next_course_identifier(year: int) -> str:
    """C-2026-001. Numbering restarts each calendar year, which is what staff expect."""
    return next_identifier(f"C-{year}", width=3)
