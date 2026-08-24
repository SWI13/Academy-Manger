"""
Payments and their proofs.

The safety-critical part of the platform. Three rules shape it:

Nothing is ever deleted or edited. A payment has no PATCH and no DELETE; it
moves between states through named transitions, each of which records who did
it and when. A mistake before approval is CANCELLED; a mistake after approval
is corrected with a new record (architecture D-4).

All three end states are terminal. There is no un-approve.

The balance is never stored. `total`, `paid`, `pending` and `remaining` are
computed from the payment rows every time they are asked for - see services.
Materialising them onto the enrolment is where the drift bug lives.
"""

from django.conf import settings
from django.db import models

from apps.core.identifiers import next_identifier
from apps.core.models import TimeStampedModel
from apps.enrollments.models import Enrollment


class PaymentStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"


class PaymentMethod(models.TextChoices):
    CASH = "CASH", "Cash"
    BANK_TRANSFER = "BANK_TRANSFER", "Bank transfer"
    CCP = "CCP", "CCP"
    CARD = "CARD", "Card"
    CHEQUE = "CHEQUE", "Cheque"
    OTHER = "OTHER", "Other"


class ScanStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    CLEAN = "CLEAN", "Clean"
    INFECTED = "INFECTED", "Infected"


TERMINAL_STATUSES = frozenset(
    {PaymentStatus.APPROVED, PaymentStatus.REJECTED, PaymentStatus.CANCELLED}
)


class Payment(TimeStampedModel):
    public_id = models.CharField(max_length=16, unique=True, editable=False)

    # Attached to the enrolment, which already names the student and the
    # course - so a payment cannot be recorded against a course the student is
    # not in. An entire class of data-entry error removed by shape.
    enrollment = models.ForeignKey(Enrollment, on_delete=models.PROTECT, related_name="payments")

    amount_minor = models.BigIntegerField(help_text="Integer minor units. Never a float.")
    currency = models.CharField(max_length=3, default="DZD")

    paid_on = models.DateField(help_text="When the money changed hands, not when it was typed in.")
    method = models.CharField(max_length=16, choices=PaymentMethod.choices)

    status = models.CharField(
        max_length=12, choices=PaymentStatus.choices, default=PaymentStatus.PENDING, db_index=True
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True)

    class Meta:
        db_table = "payments_payment"
        ordering = ["-paid_on", "-created_at"]
        indexes = [
            models.Index(fields=["enrollment", "status"]),
            models.Index(fields=["status", "paid_on"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount_minor__gt=0), name="payment_amount_positive"
            ),
            # A rejection without a reason is not a decision, it is a shrug.
            # The person who was refused has to be able to be told why.
            models.CheckConstraint(
                condition=~models.Q(status="REJECTED") | ~models.Q(rejection_reason=""),
                name="rejected_payment_has_a_reason",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="APPROVED") | models.Q(approved_at__isnull=False),
                name="approved_payment_has_a_timestamp",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.public_id} {self.amount_minor} {self.currency}"

    def save(self, *args, **kwargs):
        if not self.public_id:
            self.public_id = next_identifier("PAY", width=6)
        super().save(*args, **kwargs)

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES

    @property
    def counts_toward_balance(self) -> bool:
        return self.status == PaymentStatus.APPROVED


class PaymentProof(TimeStampedModel):
    """
    Metadata only. The bytes live in object storage; PostgreSQL holds the key.

    Several proofs per payment is normal: a rejected proof is re-uploaded
    rather than replaced, so the history of what was submitted survives.
    """

    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="proofs")

    storage_key = models.CharField(max_length=500, unique=True)
    original_filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=100)
    size_bytes = models.BigIntegerField()
    checksum_sha256 = models.CharField(max_length=64, blank=True)

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    # Staff and parents upload arbitrary files from institute machines. A
    # proof is not viewable until it has been scanned.
    scan_status = models.CharField(
        max_length=10, choices=ScanStatus.choices, default=ScanStatus.PENDING
    )
    scanned_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "payments_proof"
        ordering = ["-uploaded_at"]
        indexes = [models.Index(fields=["payment"])]

    def __str__(self) -> str:
        return f"{self.payment.public_id} {self.original_filename}"

    @property
    def is_viewable(self) -> bool:
        return self.scan_status == ScanStatus.CLEAN
