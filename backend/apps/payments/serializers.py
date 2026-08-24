"""Payment and proof serializers."""

from rest_framework import serializers

from apps.core.storage import ALLOWED_PROOF_TYPES, MAX_PROOF_BYTES
from apps.enrollments.models import Enrollment, EnrollmentStatus

from .models import Payment, PaymentMethod, PaymentProof, ScanStatus


class PaymentProofSerializer(serializers.ModelSerializer):
    uploaded_by_public_id = serializers.CharField(
        source="uploaded_by.public_id", read_only=True, default=None
    )
    is_viewable = serializers.BooleanField(read_only=True)

    class Meta:
        model = PaymentProof
        # storage_key is deliberately absent. It is an internal handle; the
        # only way to the bytes is a signed URL this API issues.
        fields = [
            "id",
            "original_filename",
            "mime_type",
            "size_bytes",
            "uploaded_at",
            "uploaded_by_public_id",
            "scan_status",
            "is_viewable",
        ]
        read_only_fields = fields


class PaymentSerializer(serializers.ModelSerializer):
    student_public_id = serializers.CharField(source="enrollment.student.public_id", read_only=True)
    student_name = serializers.CharField(source="enrollment.student.get_full_name", read_only=True)
    course_public_id = serializers.CharField(source="enrollment.course.public_id", read_only=True)
    course_title = serializers.CharField(source="enrollment.course.title", read_only=True)

    created_by_public_id = serializers.CharField(
        source="created_by.public_id", read_only=True, default=None
    )
    approved_by_public_id = serializers.CharField(
        source="approved_by.public_id", read_only=True, default=None
    )
    rejected_by_public_id = serializers.CharField(
        source="rejected_by.public_id", read_only=True, default=None
    )
    proofs = PaymentProofSerializer(many=True, read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "public_id",
            "enrollment",
            "student_public_id",
            "student_name",
            "course_public_id",
            "course_title",
            "amount_minor",
            "currency",
            "paid_on",
            "method",
            "status",
            "notes",
            "created_at",
            "created_by_public_id",
            "approved_by_public_id",
            "approved_at",
            "rejected_by_public_id",
            "rejected_at",
            "rejection_reason",
            "proofs",
        ]
        read_only_fields = fields


class PaymentCreateSerializer(serializers.Serializer):
    """
    Recording money that arrived.

    Status is absent: everything is created PENDING and moves by named
    transition, so nobody can post a payment straight to APPROVED and skip the
    review that makes the record trustworthy.
    """

    enrollment_id = serializers.IntegerField()
    amount_minor = serializers.IntegerField(min_value=1)
    paid_on = serializers.DateField()
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_enrollment_id(self, value):
        try:
            enrollment = Enrollment.objects.select_related("course", "student").get(pk=value)
        except Enrollment.DoesNotExist:
            raise serializers.ValidationError("No such enrolment.") from None

        if enrollment.status in (EnrollmentStatus.CANCELLED, EnrollmentStatus.DROPPED):
            raise serializers.ValidationError(
                f"That enrolment is {enrollment.status}. Money against a withdrawn "
                "enrolment needs an active one first."
            )
        self.enrollment = enrollment
        return value

    def validate_paid_on(self, value):
        from django.utils import timezone

        if value > timezone.localdate():
            # A payment dated in the future is a typo, and it would distort
            # every revenue figure that groups by date.
            raise serializers.ValidationError("A payment cannot be dated in the future.")
        return value

    def create(self, validated):
        return Payment.objects.create(
            enrollment=self.enrollment,
            amount_minor=validated["amount_minor"],
            currency=self.enrollment.currency,
            paid_on=validated["paid_on"],
            method=validated["method"],
            notes=validated.get("notes", ""),
            created_by=self.context["request"].user,
        )

    def to_representation(self, instance):
        return PaymentSerializer(instance, context=self.context).data


class RejectionSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000)

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError("A rejection needs a reason the payer can be told.")
        return value.strip()


class CancellationSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=1000)


class ProofUploadRequestSerializer(serializers.Serializer):
    """
    Asks for permission to upload, not for the upload itself.

    Content type and size are declared up front so they can be bound into the
    signature - the storage service then refuses anything that does not match,
    without a byte reaching Django.
    """

    filename = serializers.CharField(max_length=255)
    content_type = serializers.ChoiceField(choices=sorted(ALLOWED_PROOF_TYPES))
    size_bytes = serializers.IntegerField(min_value=1, max_value=MAX_PROOF_BYTES)


class ProofConfirmSerializer(serializers.Serializer):
    """
    Told that an upload finished.

    The client saying so is not evidence. The view HEADs the object and
    compares what is actually there against what was claimed before writing a
    row - otherwise a caller can register a proof pointing at nothing.
    """

    storage_key = serializers.CharField(max_length=500)
    filename = serializers.CharField(max_length=255)


class BalanceSerializer(serializers.Serializer):
    currency = serializers.CharField()
    total_minor = serializers.IntegerField()
    paid_minor = serializers.IntegerField()
    pending_minor = serializers.IntegerField()
    remaining_minor = serializers.IntegerField()
    is_settled = serializers.BooleanField()


class ScanStatusSerializer(serializers.Serializer):
    scan_status = serializers.ChoiceField(choices=ScanStatus.choices)
