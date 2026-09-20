"""
Emit the frontend's choice lists from the Django enums.

The OpenAPI schema carries the *values* of a TextChoices field but not its
labels, so a wilaya dropdown built from `WilayaEnum` would offer "16" with no
way to know that is Alger. These lists carry both, and are generated for the
same reason the permission union is: a wilaya added or renamed on one side and
not the other is a form that quietly disagrees with the database.

    python manage.py export_choices --check
"""

import difflib
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.core.wilayas import Wilaya
from apps.courses.models import AssignmentRole, CourseStatus
from apps.enrollments.models import EnrollmentStatus
from apps.logistics.models import ItemCondition, ItemStatus
from apps.payments.models import PaymentMethod
from apps.students.models import PriorLevel

DEFAULT_TARGET = Path("../frontend/src/lib/choices.ts")

HEADER = """/**
 * Choice lists, with their labels.
 *
 * GENERATED FILE - do not edit.
 * Regenerate with `python manage.py export_choices` in backend/.
 *
 * The OpenAPI schema types the accepted *values*; these carry the labels that
 * go beside them. A dropdown built from the enum alone would offer "16" with
 * no way to know that is Alger.
 */

export type Choice = { value: string; label: string };
"""

# Name in TypeScript -> the Django TextChoices to read.
EXPORTS = {
    "WILAYAS": Wilaya,
    "PRIOR_LEVELS": PriorLevel,
    "PAYMENT_METHODS": PaymentMethod,
    "COURSE_STATUSES": CourseStatus,
    "ENROLLMENT_STATUSES": EnrollmentStatus,
    "ASSIGNMENT_ROLES": AssignmentRole,
    # Logistics categories and locations are rows, not enums, so they are not
    # here - they arrive from the API. Condition and status are the small
    # closed vocabulary the interface reasons about, and they are.
    "ITEM_CONDITIONS": ItemCondition,
    "ITEM_STATUSES": ItemStatus,
}


def render() -> str:
    blocks = [HEADER.rstrip("\n")]

    for name, choices in EXPORTS.items():
        rows = ",\n".join(
            # ensure_ascii=False: these are Algerian place names. Bejaia and Bechar
            # written as \u00e9 escapes is a file nobody can proofread.
            f"  {{ value: {json.dumps(str(value))}, "
            f"label: {json.dumps(str(label), ensure_ascii=False)} }}"
            for value, label in choices.choices
        )
        blocks.append(f"\nexport const {name}: Choice[] = [\n{rows},\n];")

    return "\n".join(blocks) + "\n"


class Command(BaseCommand):
    help = "Write the frontend choice lists from the Django enums."

    def add_arguments(self, parser):
        parser.add_argument("--path", default=str(DEFAULT_TARGET))
        parser.add_argument(
            "--check",
            action="store_true",
            help="Exit non-zero if the file on disk differs. For CI.",
        )

    def handle(self, *args, **options):
        target = Path(options["path"])
        content = render()

        if options["check"]:
            if not target.exists():
                raise CommandError(f"{target} does not exist. Run without --check.")
            current = target.read_text(encoding="utf-8")
            if current != content:
                diff = "".join(
                    difflib.unified_diff(
                        current.splitlines(keepends=True),
                        content.splitlines(keepends=True),
                        fromfile=f"{target} (on disk)",
                        tofile=f"{target} (from the enums)",
                    )
                )
                raise CommandError(
                    f"The frontend choice lists have drifted.\n\n{diff}\n"
                    "Run: python manage.py export_choices"
                )
            self.stdout.write(self.style.SUCCESS(f"{target} matches the enums."))
            return

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        total = sum(len(choices.choices) for choices in EXPORTS.values())
        self.stdout.write(
            self.style.SUCCESS(f"Wrote {len(EXPORTS)} lists ({total} options) to {target}.")
        )
