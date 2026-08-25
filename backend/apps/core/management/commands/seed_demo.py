"""
Fill a development database with something you can actually click through.

Every screen in this platform is a screen *about* something - a roster, a
ledger, a mark sheet - and an empty database makes all of them look identical
and broken. This creates enough of a term that each role has a real day's work
in front of them.

    python manage.py seed_demo

Refuses to run outside development. The data here is invented, which is the
point: development never runs on real student records, and a seeder that could
be pointed at production is a seeder that eventually is.

Idempotent - run it twice and nothing doubles.
"""

import random
from datetime import date, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

DEMO_PASSWORD = "demo-passphrase-2026"  # noqa: S105 - development fixture

# Invented people. Algerian names because the wilaya list and phone region are,
# and a demo full of Anglo placeholders makes the localisation look untested.
STAFF = [
    ("OWNER", "Amina", "Belkacem"),
    ("ADMIN", "Karim", "Haddad"),
    ("RECEPTION", "Lina", "Meziane"),
]
PROFESSORS = [
    ("Sofiane", "Bouzid", "English language and literature"),
    ("Yasmine", "Cherif", "Mathematics"),
]
STUDENTS = [
    ("Yacine", "Amrani", date(2005, 4, 12), "16", "INTERMEDIATE"),
    ("Nadia", "Slimani", date(2004, 7, 3), "31", "UPPER_INTERMEDIATE"),
    ("Riad", "Benali", date(2006, 2, 19), "16", "ELEMENTARY"),
    ("Meriem", "Ouali", date(2005, 11, 30), "09", "INTERMEDIATE"),
    ("Anis", "Kaci", date(2003, 1, 22), "25", "ADVANCED"),
    ("Salima", "Toumi", date(2006, 8, 8), "16", "BEGINNER"),
]


class Command(BaseCommand):
    help = "Create a term's worth of invented data for clicking through."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Run even though DEBUG is off. Still refuses production settings.",
        )

    def handle(self, *args, **options):
        module = settings.SETTINGS_MODULE or ""
        if module.endswith((".prod", ".staging")):
            raise CommandError(
                f"Refusing to run against {module}. This writes invented people "
                "into whatever database it is pointed at."
            )
        if not settings.DEBUG and not options["force"]:
            raise CommandError("DEBUG is off. Pass --force if this really is development.")

        random.seed(20260825)  # noqa: S311 - reproducible demo data, not security
        with transaction.atomic():
            self._seed()

    # ------------------------------------------------------------------

    def _seed(self):
        from django.contrib.auth import get_user_model

        from apps.assessments.models import Assessment, AssessmentKind, AssessmentScore
        from apps.courses.models import AssignmentStatus, Course, CourseProfessor, CourseStatus
        from apps.enrollments.models import Enrollment, EnrollmentStatus
        from apps.payments.models import Payment, PaymentMethod, PaymentStatus
        from apps.professors.models import ProfessorProfile
        from apps.rbac.models import Role
        from apps.rbac.services import assign_role
        from apps.reviews.models import Review, ReviewStatus
        from apps.schedules.models import Schedule, ScheduleStatus
        from apps.students.models import StudentProfile

        User = get_user_model()
        phone = iter(range(555_900_001, 555_900_999))

        def make(role, first, last):
            existing = User.objects.filter(first_name=first, last_name=last).first()
            if existing:
                return existing, False
            user = User.objects.create_user(
                first_name=first,
                last_name=last,
                primary_role=role,
                phone=f"+213{next(phone)}",
                password=DEMO_PASSWORD,
            )
            assign_role(user, Role.objects.get(code=role))
            return user, True

        # --- people ---------------------------------------------------
        staff = {}
        for role, first, last in STAFF:
            user, _ = make(role, first, last)
            staff[role] = user

        professors = []
        for first, last, speciality in PROFESSORS:
            user, fresh = make("PROFESSOR", first, last)
            if fresh:
                ProfessorProfile.objects.create(
                    user=user,
                    specialisation=speciality,
                    qualifications="Licence, ENS",
                    hired_at=date(2024, 9, 1),
                )
            professors.append(user)

        students = []
        for first, last, dob, wilaya, level in STUDENTS:
            user, fresh = make("STUDENT", first, last)
            if fresh:
                StudentProfile.objects.create(
                    user=user,
                    date_of_birth=dob,
                    wilaya=wilaya,
                    prior_level=level,
                    emergency_contact_name=f"{last} family",
                    emergency_contact_phone=f"+213{next(phone)}",
                )
            students.append(user)

        # --- courses --------------------------------------------------
        today = date.today()
        catalogue = [
            # One finished, so reviews and completed enrolments have something
            # to attach to. One running, one not yet open.
            (
                "English B2",
                today - timedelta(days=150),
                today - timedelta(days=10),
                5_000_000,
                CourseStatus.COMPLETED,
                20,
                professors[0],
            ),
            (
                "Mathematics - Baccalaureate",
                today - timedelta(days=30),
                today + timedelta(days=90),
                6_500_000,
                CourseStatus.ACTIVE,
                15,
                professors[1],
            ),
            (
                "English A2 - evening",
                today + timedelta(days=20),
                today + timedelta(days=160),
                4_000_000,
                CourseStatus.DRAFT,
                12,
                professors[0],
            ),
        ]

        courses = []
        for title, start, end, price, status, capacity, professor in catalogue:
            course, fresh = Course.objects.get_or_create(
                title=title,
                defaults={
                    "start_date": start,
                    "end_date": end,
                    "price_minor": price,
                    "status": status,
                    "capacity": capacity,
                    "description": f"{title}. Small groups, twice a week.",
                },
            )
            if fresh:
                CourseProfessor.objects.create(
                    course=course, professor=professor, status=AssignmentStatus.ACTIVE
                )
                for weekday, start_at in ((6, time(9, 0)), (2, time(14, 0))):
                    Schedule.objects.create(
                        course=course,
                        professor=professor,
                        weekday=weekday,
                        start_time=start_at,
                        end_time=(time(11, 0) if start_at.hour == 9 else time(16, 0)),
                        room=f"Room {chr(65 + len(courses))}",
                        effective_from=start,
                        effective_to=end,
                        status=ScheduleStatus.ACTIVE,
                    )
            courses.append(course)

        finished, running, _draft = courses

        # --- enrolments -----------------------------------------------
        enrolments = {}
        for index, student in enumerate(students):
            course = finished if index < 4 else running
            status = EnrollmentStatus.COMPLETED if course is finished else EnrollmentStatus.ACTIVE
            enrolment, _ = Enrollment.objects.get_or_create(
                student=student,
                course=course,
                defaults={
                    "price_at_enrollment_minor": course.price_minor,
                    "status": status,
                    "created_by": staff["RECEPTION"],
                },
            )
            enrolments[student.public_id] = enrolment

        # Everyone on the running course too, so its roster is not two people.
        for student in students[:3]:
            Enrollment.objects.get_or_create(
                student=student,
                course=running,
                defaults={
                    "price_at_enrollment_minor": running.price_minor,
                    "status": EnrollmentStatus.ACTIVE,
                    "created_by": staff["RECEPTION"],
                },
            )

        # --- marks ----------------------------------------------------
        scheme = [
            ("Unit 1 quiz", AssessmentKind.QUIZ, Decimal("20"), Decimal("0.20"), True),
            ("Midterm", AssessmentKind.MIDTERM, Decimal("100"), Decimal("0.30"), True),
            # Left unpublished on purpose: a professor needs something waiting
            # to publish, and a student needs a mark they cannot see yet.
            ("Final exam", AssessmentKind.FINAL, Decimal("100"), Decimal("0.50"), False),
        ]
        for course in (finished, running):
            professor = course.assignments.first().professor
            for title, kind, maximum, weight, published in scheme:
                assessment, fresh = Assessment.objects.get_or_create(
                    course=course,
                    title=title,
                    defaults={
                        "kind": kind,
                        "max_score": maximum,
                        "weight": weight,
                        "held_on": course.start_date + timedelta(days=30),
                        "created_by": professor,
                        "is_published": published,
                        "published_at": timezone.now() if published else None,
                        "published_by": professor if published else None,
                    },
                )
                if not fresh:
                    continue
                for enrolment in course.enrollments.all():
                    # A blank is not a zero: one student is deliberately left
                    # unmarked so the gradebook shows an honest gap.
                    if enrolment.student == students[-1]:
                        continue
                    AssessmentScore.objects.create(
                        assessment=assessment,
                        enrollment=enrolment,
                        score=Decimal(
                            random.randint(  # noqa: S311 - demo data
                                int(maximum * Decimal("0.45")), int(maximum)
                            )
                        ),
                        entered_by=professor,
                        last_changed_by=professor,
                    )

        # --- money ----------------------------------------------------
        # Deliberately a mix: settled, part-paid, awaiting approval, rejected.
        # Reception records them; the owner approves. Never the same person -
        # that is the separation of duty the whole ledger rests on.
        recorder, approver = staff["RECEPTION"], staff["OWNER"]
        plans = [
            (0, [(2_500_000, PaymentStatus.APPROVED), (2_500_000, PaymentStatus.APPROVED)]),
            (1, [(2_000_000, PaymentStatus.APPROVED), (1_000_000, PaymentStatus.PENDING)]),
            (2, [(1_500_000, PaymentStatus.APPROVED)]),
            (3, [(500_000, PaymentStatus.REJECTED)]),
            (4, [(3_000_000, PaymentStatus.PENDING)]),
        ]
        for index, instalments in plans:
            enrolment = enrolments[students[index].public_id]
            if enrolment.payments.exists():
                continue
            for offset, (amount, status) in enumerate(instalments):
                now = timezone.now()
                Payment.objects.create(
                    enrollment=enrolment,
                    amount_minor=amount,
                    paid_on=today - timedelta(days=60 - offset * 20),
                    method=PaymentMethod.CASH if offset == 0 else PaymentMethod.CCP,
                    status=status,
                    created_by=recorder,
                    approved_by=approver if status == PaymentStatus.APPROVED else None,
                    approved_at=now if status == PaymentStatus.APPROVED else None,
                    rejected_by=approver if status == PaymentStatus.REJECTED else None,
                    rejected_at=now if status == PaymentStatus.REJECTED else None,
                    rejection_reason=(
                        "The reference on the slip does not match any account."
                        if status == PaymentStatus.REJECTED
                        else ""
                    ),
                )

        # --- reviews --------------------------------------------------
        # One approved with a reply, one still waiting, so the moderation queue
        # is not empty on first look.
        review_plan = [
            (0, 5, "Clear explanations and a lot of speaking practice.", ReviewStatus.APPROVED),
            (1, 2, "Went too fast through the tenses.", ReviewStatus.PENDING),
        ]
        for index, rating, comment, status in review_plan:
            enrolment = enrolments[students[index].public_id]
            if enrolment.status != EnrollmentStatus.COMPLETED:
                continue
            Review.objects.get_or_create(
                enrollment=enrolment,
                defaults={
                    "rating": rating,
                    "comment": comment,
                    "status": status,
                    "moderated_by": approver if status == ReviewStatus.APPROVED else None,
                    "moderated_at": (timezone.now() if status == ReviewStatus.APPROVED else None),
                    "admin_response": (
                        "Thank you - we have added a revision week."
                        if status == ReviewStatus.APPROVED
                        else ""
                    ),
                },
            )

        # professors[1] teaches the course that is actually running, so their
        # dashboard has a next session on it. professors[0] teaches the
        # finished one and would open on an empty week, which is a poor
        # first impression of a screen whose whole job is 'what is next'.
        self._report(staff, professors[1], students)

    def _report(self, staff, professor, students):
        out = self.stdout
        out.write(self.style.SUCCESS("\nSeeded. Sign in at http://localhost:3000\n"))
        out.write(f"Password for everyone: {DEMO_PASSWORD}\n\n")

        rows = [
            ("Owner", staff["OWNER"], "everything, including the audit log"),
            ("Administrator", staff["ADMIN"], "everything except roles and the audit log"),
            ("Reception", staff["RECEPTION"], "records payments, cannot approve them"),
            ("Professor", professor, "marks and the roster; no money at all"),
            ("Student", students[0], "own marks, own payments, own review"),
        ]
        width = max(len(label) for label, _, _ in rows)
        for label, user, note in rows:
            out.write(f"  {label:<{width}}  {user.public_id:<14} {note}\n")
        out.write("\n")
