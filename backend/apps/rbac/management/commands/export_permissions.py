"""
Emit the frontend's permission types from the catalogue.

The frontend declares a union type of codenames so that a typo in
`can("payment.aprove")` is a compile error rather than a button hidden
forever. That guarantee only holds while the two lists agree - and nothing
would notice them drifting, because a permission the frontend does not know
about simply never gates anything and the screen still looks right.

So the file is generated rather than written, the same way the API types are.
CI regenerates it and fails if the working tree changes, which turns drift
into a red build instead of a silent hole.

    python manage.py export_permissions --check
"""

import difflib
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.core.enums import RoleCode
from apps.rbac.catalog import PERMISSIONS, ROLE_NAMES

DEFAULT_TARGET = Path("../frontend/src/lib/permissions.ts")

HEADER = """/**
 * The permission codenames the backend recognises.
 *
 * GENERATED FILE - do not edit.
 * Regenerate with `python manage.py export_permissions` in backend/.
 *
 * Written from `apps/rbac/catalog.py`, which is the single source of truth.
 * The union type is the point: a typo in a permission name is a compile
 * error, not a button that is hidden forever.
 */
"""


def render() -> str:
    lines = [HEADER.rstrip("\n"), "", "export const PERMISSIONS = ["]

    category = None
    for codename, (_label, group) in PERMISSIONS.items():
        if group != category:
            category = group
            lines.append(f"  // {category}")
        lines.append(f'  "{codename}",')

    lines.append("] as const;\n")
    lines.append("export type Permission = (typeof PERMISSIONS)[number];\n")

    role_union = "\n".join(f'  | "{code}"' for code in RoleCode.values)
    lines.append(f"export type RoleCode =\n{role_union};\n")

    labels = "\n".join(f'  {code}: "{ROLE_NAMES[code]}",' for code in RoleCode.values)
    lines.append(f"export const ROLE_LABELS: Record<RoleCode, string> = {{\n{labels}\n}};")

    return "\n".join(lines) + "\n"


class Command(BaseCommand):
    help = "Write the frontend permission types from the RBAC catalogue."

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
                        tofile=f"{target} (from catalogue)",
                    )
                )
                raise CommandError(
                    "The frontend permission list has drifted from the "
                    f"catalogue.\n\n{diff}\nRun: python manage.py export_permissions"
                )
            self.stdout.write(self.style.SUCCESS(f"{target} matches the catalogue."))
            return

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        self.stdout.write(
            self.style.SUCCESS(f"Wrote {len(PERMISSIONS)} permissions to {target}.")
        )
