"""Schedule serializers, including clash detection."""

from rest_framework import serializers

from apps.courses.models import Course

from .models import Schedule, ScheduleStatus


class ScheduleSerializer(serializers.ModelSerializer):
    course_public_id = serializers.CharField(source="course.public_id", read_only=True)
    course_title = serializers.CharField(source="course.title", read_only=True)
    weekday_name = serializers.CharField(source="get_weekday_display", read_only=True)
    professor_public_id = serializers.CharField(
        source="professor.public_id", read_only=True, default=None
    )

    class Meta:
        model = Schedule
        fields = [
            "id",
            "course_public_id",
            "course_title",
            "professor_public_id",
            "weekday",
            "weekday_name",
            "start_time",
            "end_time",
            "room",
            "effective_from",
            "effective_to",
            "status",
            "notes",
        ]
        read_only_fields = ["id"]


class ScheduleWriteSerializer(serializers.ModelSerializer):
    course_public_id = serializers.CharField(write_only=True)
    # A caller may acknowledge a clash and proceed. Institutes legitimately
    # overbook while rearranging a timetable - architecture D-5 chose warn,
    # not block. The warning is still returned so nobody does it by accident.
    allow_clash = serializers.BooleanField(write_only=True, default=False)

    class Meta:
        model = Schedule
        fields = [
            "course_public_id",
            "weekday",
            "start_time",
            "end_time",
            "room",
            "effective_from",
            "effective_to",
            "notes",
            "allow_clash",
        ]

    def validate_course_public_id(self, value):
        try:
            self.course = Course.objects.get(public_id__iexact=value.strip())
        except Course.DoesNotExist:
            raise serializers.ValidationError("No course with that ID.") from None
        return value

    def validate(self, attrs):
        if attrs["end_time"] <= attrs["start_time"]:
            raise serializers.ValidationError({"end_time": "A session must end after it starts."})

        candidate = Schedule(
            course=self.course,
            weekday=attrs["weekday"],
            start_time=attrs["start_time"],
            end_time=attrs["end_time"],
            room=attrs.get("room", ""),
            effective_from=attrs.get("effective_from"),
            effective_to=attrs.get("effective_to"),
        )
        self._clashes = self._find_clashes(candidate)

        if self._clashes and not attrs.get("allow_clash"):
            raise serializers.ValidationError(
                {
                    "clash": [
                        f"{c['kind']} clash with {c['course']} "
                        f"({c['weekday']} {c['start']}-{c['end']}"
                        + (f", room {c['room']}" if c["room"] else "")
                        + "). Resend with allow_clash=true to book anyway."
                        for c in self._clashes
                    ]
                }
            )
        return attrs

    def _find_clashes(self, candidate) -> list[dict]:
        """
        Room and professor double-bookings on the same weekday.

        Only ACTIVE slots count - a suspended or ended pattern is not
        occupying anything.
        """
        clashes = []
        others = (
            Schedule.objects.filter(weekday=candidate.weekday, status=ScheduleStatus.ACTIVE)
            .select_related("course")
            .exclude(pk=getattr(self.instance, "pk", None))
        )

        professor_ids = set(
            self.course.assignments.filter(status="ACTIVE").values_list("professor_id", flat=True)
        )

        for other in others:
            if not candidate.overlaps(other):
                continue

            kind = None
            if candidate.room and other.room and candidate.room == other.room:
                kind = "Room"
            elif professor_ids and professor_ids & set(
                other.course.assignments.filter(status="ACTIVE").values_list(
                    "professor_id", flat=True
                )
            ):
                kind = "Professor"

            if kind:
                clashes.append(
                    {
                        "kind": kind,
                        "course": other.course.public_id,
                        "weekday": other.get_weekday_display(),
                        "start": other.start_time.strftime("%H:%M"),
                        "end": other.end_time.strftime("%H:%M"),
                        "room": other.room,
                    }
                )
        return clashes

    def create(self, validated):
        validated.pop("course_public_id", None)
        validated.pop("allow_clash", None)
        return Schedule.objects.create(course=self.course, **validated)

    def to_representation(self, instance):
        return ScheduleSerializer(instance, context=self.context).data


class NextSessionSerializer(serializers.Serializer):
    """What a professor's "what is next" screen needs, and nothing else."""

    course_public_id = serializers.CharField()
    course_title = serializers.CharField()
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    room = serializers.CharField(allow_blank=True)
    weekday_name = serializers.CharField()
    enrolled_count = serializers.IntegerField()
