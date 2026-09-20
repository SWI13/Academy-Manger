"""Register serializers."""

from rest_framework import serializers

from apps.courses.models import Course
from apps.enrollments.models import Enrollment, EnrollmentStatus
from apps.schedules.models import Schedule

from .models import AttendanceRecord, AttendanceSession, AttendanceStatus


class AttendanceRecordSerializer(serializers.ModelSerializer):
    student_public_id = serializers.CharField(source="enrollment.student.public_id", read_only=True)
    student_name = serializers.CharField(source="enrollment.student.get_full_name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    was_corrected = serializers.BooleanField(read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = [
            "id",
            "session",
            "enrollment",
            "student_public_id",
            "student_name",
            "status",
            "status_display",
            "minutes_late",
            "note",
            "was_corrected",
            "change_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AttendanceSessionSerializer(serializers.ModelSerializer):
    course_public_id = serializers.CharField(source="course.public_id", read_only=True)
    course_title = serializers.CharField(source="course.title", read_only=True)
    room = serializers.CharField(source="schedule.room", read_only=True, default="")

    # The three counts a list of registers wants, so a screen showing twenty
    # registers does not fetch twenty sets of rows to count them.
    present_count = serializers.IntegerField(read_only=True)
    absent_count = serializers.IntegerField(read_only=True)
    late_count = serializers.IntegerField(read_only=True)
    marked_count = serializers.IntegerField(read_only=True)
    roster_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = AttendanceSession
        fields = [
            "id",
            "course",
            "course_public_id",
            "course_title",
            "held_on",
            "schedule",
            "room",
            "status",
            "topic",
            "notes",
            "present_count",
            "absent_count",
            "late_count",
            "marked_count",
            "roster_count",
            "submitted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "submitted_at",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        course = attrs.get("course", getattr(self.instance, "course", None))
        held_on = attrs.get("held_on", getattr(self.instance, "held_on", None))
        schedule = attrs.get("schedule", getattr(self.instance, "schedule", None))

        if schedule and course and schedule.course_id != course.pk:
            raise serializers.ValidationError({"schedule": "That slot belongs to another course."})

        if course and held_on:
            if held_on < course.start_date or held_on > course.end_date:
                raise serializers.ValidationError(
                    {"held_on": ("That date is outside the course's own start and end dates.")}
                )
        return attrs


class AttendanceSessionWriteSerializer(AttendanceSessionSerializer):
    """
    Opening a register.

    `course` and `held_on` together are unique, and DRF's own uniqueness
    handling produces "The fields course, held_on must make a unique set",
    which is not a sentence to put in front of a professor. The viewset
    catches the clash and answers with the register that already exists
    instead - see `AttendanceSessionViewSet.create`.
    """

    class Meta(AttendanceSessionSerializer.Meta):
        # Off, so the viewset can answer "here is the one that already exists"
        # rather than a validation error the professor has to interpret.
        validators = []


class RegisterRowSerializer(serializers.Serializer):
    """One name on the sheet."""

    enrollment = serializers.IntegerField()
    status = serializers.ChoiceField(choices=AttendanceStatus.choices)
    minutes_late = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    note = serializers.CharField(required=False, allow_blank=True, max_length=200, default="")


class RegisterSerializer(serializers.Serializer):
    """
    The whole sheet, saved at once.

    Membership is resolved and checked here rather than in the service, so a
    row naming an enrolment on another course is a 400 with the offending id
    in it rather than a row written where it does not belong.
    """

    rows = RegisterRowSerializer(many=True)

    def validate_rows(self, rows):
        session = self.context["session"]

        reachable = {
            enrollment.pk: enrollment
            for enrollment in Enrollment.objects.filter(course=session.course)
            .exclude(status__in=[EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED])
            .select_related("student")
        }

        seen: set[int] = set()
        resolved = []
        for row in rows:
            enrollment_id = row["enrollment"]
            if enrollment_id not in reachable:
                raise serializers.ValidationError(
                    f"Enrolment {enrollment_id} is not on this course."
                )
            if enrollment_id in seen:
                raise serializers.ValidationError(
                    f"Enrolment {enrollment_id} appears twice on the sheet."
                )
            seen.add(enrollment_id)
            resolved.append({**row, "enrollment": reachable[enrollment_id]})

        return resolved


class RegisterResultSerializer(serializers.Serializer):
    created = serializers.IntegerField()
    updated = serializers.IntegerField()
    unchanged = serializers.IntegerField()
    records = AttendanceRecordSerializer(many=True)


class AttendanceTallySerializer(serializers.Serializer):
    present = serializers.IntegerField()
    late = serializers.IntegerField()
    absent = serializers.IntegerField()
    total = serializers.IntegerField()
    rate = serializers.FloatField(allow_null=True)


class AttendanceStudentRowSerializer(AttendanceTallySerializer):
    enrollment_id = serializers.IntegerField()
    student_public_id = serializers.CharField()
    student_name = serializers.CharField()
    course_public_id = serializers.CharField()
    course_title = serializers.CharField()


class AttendanceSummarySerializer(serializers.Serializer):
    """One course, or one student, tallied over a period."""

    totals = AttendanceTallySerializer()
    students = AttendanceStudentRowSerializer(many=True)
    session_count = serializers.IntegerField()
    course_public_id = serializers.CharField(allow_blank=True)
    course_title = serializers.CharField(allow_blank=True)
    from_date = serializers.DateField(allow_null=True)
    to_date = serializers.DateField(allow_null=True)


class RosterRowSerializer(serializers.Serializer):
    """
    A name on a register that has not been taken yet.

    What makes an unfilled register printable: a blank sheet of the class,
    with the marks already recorded filled in where there are any.
    """

    enrollment = serializers.IntegerField()
    student_public_id = serializers.CharField()
    student_name = serializers.CharField()
    status = serializers.CharField(allow_blank=True)
    minutes_late = serializers.IntegerField(allow_null=True)
    note = serializers.CharField(allow_blank=True)


class SessionSheetSerializer(serializers.Serializer):
    """The register as a screen or a sheet of paper wants it: session + roster."""

    session = AttendanceSessionSerializer()
    rows = RosterRowSerializer(many=True)
    totals = AttendanceTallySerializer()


class CourseBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "public_id", "title"]


class ScheduleBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Schedule
        fields = ["id", "weekday", "start_time", "end_time", "room"]
