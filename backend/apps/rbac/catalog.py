"""
The permission catalogue and the role matrix, as code.

This module is the single source of truth for two things that must never drift
apart: the list of permissions the platform recognises, and which permissions
each role starts with. The seed migration applies it, and the tests assert
against it, so a permission added here without a decision about who gets it
fails the suite rather than shipping silently.

FULL vs SCOPED is documentation of intent, not enforcement. Both mean the role
holds the permission; the difference is whether the queryset narrows the rows
they can reach. Scoping is gate 3 (apps.core.viewsets), a separate layer -
holding `score.enter` says a professor may enter marks at all, and the scoped
queryset says which students' marks.

These are seed values. Once deployed, the owner changes any of it through
RolePermission rows without a code change - which is the whole point of not
hard-coding permissions.
"""

from apps.core.enums import RoleCode

FULL = "full"
SCOPED = "scoped"

# --- the catalogue: codename -> (human name, category) -----------------------
PERMISSIONS: dict[str, tuple[str, str]] = {
    # Users & access
    "user.view": ("View users", "Users & access"),
    "user.create": ("Create users", "Users & access"),
    "user.update": ("Edit users", "Users & access"),
    "user.deactivate": ("Deactivate users", "Users & access"),
    "user.reset_password": ("Reset passwords", "Users & access"),
    "user.assign_role": ("Assign roles", "Users & access"),
    "role.manage": ("Manage roles and permissions", "Users & access"),
    # Catalogue
    "course.view": ("View courses", "Catalogue"),
    "course.create": ("Create courses", "Catalogue"),
    "course.update": ("Edit courses", "Catalogue"),
    "course.archive": ("Archive courses", "Catalogue"),
    "course.assign_professor": ("Assign professors to courses", "Catalogue"),
    "schedule.view": ("View schedules", "Catalogue"),
    "schedule.manage": ("Manage schedules", "Catalogue"),
    # Enrolment
    "enrollment.view": ("View enrolments", "Enrolment"),
    "enrollment.create": ("Enrol students", "Enrolment"),
    "enrollment.update": ("Edit enrolments", "Enrolment"),
    "enrollment.cancel": ("Cancel enrolments", "Enrolment"),
    # Grades
    "assessment.view": ("View assessments", "Grades"),
    "assessment.manage": ("Create and edit assessments", "Grades"),
    "score.view": ("View marks", "Grades"),
    "score.enter": ("Enter and correct marks", "Grades"),
    "score.publish": ("Publish marks to students", "Grades"),
    # Money
    "payment.view": ("View payments", "Money"),
    "payment.create": ("Record payments", "Money"),
    "payment.approve": ("Approve payments", "Money"),
    "payment.reject": ("Reject payments", "Money"),
    "payment.cancel": ("Cancel pending payments", "Money"),
    "proof.upload": ("Upload payment proofs", "Money"),
    "proof.view": ("View payment proofs", "Money"),
    # Engagement
    "review.create": ("Submit a review", "Engagement"),
    "review.view": ("View reviews", "Engagement"),
    "review.moderate": ("Moderate reviews", "Engagement"),
    "notification.send": ("Send notifications", "Engagement"),
    # Oversight
    "report.view_operational": ("View operational reports", "Oversight"),
    "report.view_financial": ("View financial reports", "Oversight"),
    "report.export": ("Export reports", "Oversight"),
    "audit.view": ("View the audit log", "Oversight"),
    "settings.manage": ("Manage system settings", "Oversight"),
}

# --- the matrix: role -> {codename: FULL | SCOPED} ---------------------------
ROLE_MATRIX: dict[str, dict[str, str]] = {
    RoleCode.OWNER: {
        "user.view": FULL,
        "user.create": FULL,
        "user.update": FULL,
        "user.deactivate": FULL,
        "user.reset_password": FULL,
        "user.assign_role": FULL,
        "role.manage": FULL,
        "course.view": FULL,
        "course.create": FULL,
        "course.update": FULL,
        "course.archive": FULL,
        "course.assign_professor": FULL,
        "schedule.view": FULL,
        "schedule.manage": FULL,
        "enrollment.view": FULL,
        "enrollment.create": FULL,
        "enrollment.update": FULL,
        "enrollment.cancel": FULL,
        "assessment.view": FULL,
        "assessment.manage": FULL,
        "score.view": FULL,
        "score.enter": FULL,
        "score.publish": FULL,
        "payment.view": FULL,
        "payment.create": FULL,
        "payment.approve": FULL,
        "payment.reject": FULL,
        "payment.cancel": FULL,
        "proof.upload": FULL,
        "proof.view": FULL,
        "review.view": FULL,
        "review.moderate": FULL,
        "notification.send": FULL,
        "report.view_operational": FULL,
        "report.view_financial": FULL,
        "report.export": FULL,
        "audit.view": FULL,
        "settings.manage": FULL,
        # Deliberately absent: review.create. Only a student who took the
        # course may review it, and the owner is not exempt from that.
    },
    RoleCode.ADMIN: {
        "user.view": FULL,
        "user.create": FULL,
        "user.update": FULL,
        "user.deactivate": FULL,
        "user.reset_password": FULL,
        "course.view": FULL,
        "course.create": FULL,
        "course.update": FULL,
        "course.archive": FULL,
        "course.assign_professor": FULL,
        "schedule.view": FULL,
        "schedule.manage": FULL,
        "enrollment.view": FULL,
        "enrollment.create": FULL,
        "enrollment.update": FULL,
        "enrollment.cancel": FULL,
        "assessment.view": FULL,
        "assessment.manage": FULL,
        "score.view": FULL,
        "score.enter": FULL,
        "score.publish": FULL,
        "payment.view": FULL,
        "payment.create": FULL,
        "payment.approve": FULL,
        "payment.reject": FULL,
        "payment.cancel": FULL,
        "proof.upload": FULL,
        "proof.view": FULL,
        "review.view": FULL,
        "review.moderate": FULL,
        "notification.send": FULL,
        "report.view_operational": FULL,
        "report.view_financial": FULL,
        "report.export": FULL,
        # Absent: user.assign_role, role.manage, audit.view, settings.manage.
        # An admin cannot grant themselves powers, nor read the log that
        # records what they did.
    },
    RoleCode.RECEPTION: {
        "user.view": SCOPED,
        "user.create": SCOPED,
        "user.update": SCOPED,
        "course.view": FULL,
        "schedule.view": FULL,
        "enrollment.view": FULL,
        "enrollment.create": FULL,
        "enrollment.update": FULL,
        "payment.view": FULL,
        "payment.create": FULL,
        "payment.cancel": SCOPED,
        "proof.upload": FULL,
        "proof.view": FULL,
        "report.view_operational": SCOPED,
        # Absent, and this is the separation of duty that matters:
        # payment.approve and payment.reject. Whoever takes the money must
        # not be the one who confirms it was taken.
    },
    RoleCode.PROFESSOR: {
        "user.view": SCOPED,
        "user.update": SCOPED,
        "course.view": SCOPED,
        "schedule.view": SCOPED,
        "enrollment.view": SCOPED,
        "assessment.view": SCOPED,
        "assessment.manage": SCOPED,
        "score.view": SCOPED,
        "score.enter": SCOPED,
        "score.publish": SCOPED,
        "review.view": SCOPED,
        "report.view_operational": SCOPED,
        # Absent: every payment.* and proof.* permission. A professor sees
        # who is in the room, not who has paid.
    },
    RoleCode.STUDENT: {
        "user.view": SCOPED,
        "user.update": SCOPED,
        "course.view": SCOPED,
        "schedule.view": SCOPED,
        "enrollment.view": SCOPED,
        "assessment.view": SCOPED,
        "score.view": SCOPED,
        "payment.view": SCOPED,
        "proof.upload": SCOPED,
        "proof.view": SCOPED,
        "review.create": SCOPED,
        "review.view": SCOPED,
    },
}

ROLE_NAMES: dict[str, str] = {
    RoleCode.OWNER: "Owner",
    RoleCode.ADMIN: "Administrator",
    RoleCode.RECEPTION: "Reception",
    RoleCode.PROFESSOR: "Professor",
    RoleCode.STUDENT: "Student",
}


def codenames_for(role_code: str) -> frozenset[str]:
    """Permission codenames a role holds in the seed matrix."""
    return frozenset(ROLE_MATRIX.get(role_code, {}))
