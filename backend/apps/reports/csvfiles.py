"""
Turning a report into a CSV.

Two things here are not obvious.

Money is written as minor units, in a column named so, plus a separate
currency column. Not "1 234,56". A spreadsheet opened in a French locale will
reinterpret a decimal comma, and a figure that changes meaning depending on
who opens the file is worse than one that needs dividing by a hundred.

And every field is passed through a formula guard. Excel treats a cell
starting with =, +, - or @ as a formula, so a student whose review or name
contains one turns a downloaded report into code the finance office executes
by opening it. The guard is on the writer rather than on input validation
because it is a property of CSV, not of the data.
"""

import csv
import io

FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _defuse(value):
    """Neutralise a cell a spreadsheet would otherwise execute."""
    if isinstance(value, str) and value.startswith(FORMULA_PREFIXES):
        return "'" + value
    return value


def to_csv(rows: list[dict], columns: list[str] | None = None) -> bytes:
    """
    Serialise report rows. Columns come from the first row unless given, so a
    report gains a column by returning one rather than by editing this.
    """
    if columns is None:
        columns = list(rows[0]) if rows else []

    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: _defuse(row.get(column, "")) for column in columns})

    # BOM so Excel opens UTF-8 correctly. Arabic and French names in a roster
    # render as mojibake without it, and the person who opens the file has no
    # way to fix that.
    return b"\xef\xbb\xbf" + buffer.getvalue().encode("utf-8")
