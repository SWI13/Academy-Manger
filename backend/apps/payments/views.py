"""Payments, the approval workflow, and proof upload."""

import logging

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.core import storage
from apps.core.viewsets import ScopedModelViewSet
from apps.courses.scoping import scope_enrollments
from apps.enrollments.models import Enrollment
from apps.rbac.permissions import RequirePermission
from apps.rbac.services import has_permission

from .models import Payment, PaymentProof, ScanStatus
from .scoping import scope_payments, scope_proofs
from .serializers import (
    BalanceSerializer,
    CancellationSerializer,
    PaymentCreateSerializer,
    PaymentProofSerializer,
    PaymentSerializer,
    ProofConfirmSerializer,
    ProofUploadRequestSerializer,
    RejectionSerializer,
)
from .services import TransitionError, approve, cancel, enrollment_balance, reject

logger = logging.getLogger(__name__)


def _transition_error(exc: TransitionError):
    return Response(
        {"error": {"code": "invalid_transition", "message": str(exc), "details": {}}},
        status=status.HTTP_409_CONFLICT,
    )


@extend_schema_view(
    list=extend_schema(
        summary="List payments",
        parameters=[
            OpenApiParameter("status", str, description="PENDING, APPROVED, REJECTED, CANCELLED."),
            OpenApiParameter("student", str, description="Student public ID."),
            OpenApiParameter("course", str, description="Course public ID."),
            OpenApiParameter("from", str, description="Paid on or after (YYYY-MM-DD)."),
            OpenApiParameter("to", str, description="Paid on or before (YYYY-MM-DD)."),
        ],
    )
)
class PaymentViewSet(ScopedModelViewSet):
    """
    No PATCH and no DELETE.

    A payment is not editable. It is created PENDING and moves by named
    transition, each recording who acted and when. A mistake before approval
    is cancelled; a mistake after approval is corrected with a new record
    (architecture D-4).
    """

    queryset = (
        Payment.objects.all()
        .select_related(
            "enrollment__student", "enrollment__course", "created_by", "approved_by", "rejected_by"
        )
        .prefetch_related("proofs")
    )
    lookup_field = "public_id"
    lookup_value_regex = "PAY-[0-9]+"

    # PATCH and DELETE are routed so the handlers below can answer 405 - the
    # truthful "this operation does not exist here". Omitting the verbs would
    # make DRF answer 403 from the permission layer first, which reads as
    # "you may not edit payments" rather than "nobody edits payments".
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    required_permissions = {
        "list": "payment.view",
        "retrieve": "payment.view",
        "create": "payment.create",
        "approve": "payment.approve",
        "reject": "payment.reject",
        "cancel": "payment.cancel",
        "proofs": "proof.view",
        "upload_url": "proof.upload",
        "confirm_proof": "proof.upload",
        "update": "payment.create",
        "partial_update": "payment.create",
        "destroy": "payment.create",
    }

    def get_serializer_class(self):
        if self.action == "create":
            return PaymentCreateSerializer
        return PaymentSerializer

    def update(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            "PATCH",
            detail=(
                "Payments are not editable. Cancel a pending entry, or correct an "
                "approved one with a new record."
            ),
        )

    partial_update = update

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            "DELETE",
            detail=(
                "Payments are never deleted. Cancel a pending entry, or correct an "
                "approved one with a new record."
            ),
        )

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        state = (params.get("status") or "").strip().upper()
        if state:
            queryset = queryset.filter(status=state)

        student = (params.get("student") or "").strip()
        if student:
            queryset = queryset.filter(enrollment__student__public_id__iexact=student)

        course = (params.get("course") or "").strip()
        if course:
            queryset = queryset.filter(enrollment__course__public_id__iexact=course)

        start = (params.get("from") or "").strip()
        if start:
            queryset = queryset.filter(paid_on__gte=start)

        end = (params.get("to") or "").strip()
        if end:
            queryset = queryset.filter(paid_on__lte=end)

        return queryset

    def scope_queryset(self, queryset, user):
        return scope_payments(queryset, user)

    def perform_create(self, serializer):
        payment = serializer.save()
        record(
            AuditAction.PAYMENT_CREATED,
            actor=self.request.user,
            obj=payment,
            new={
                "amount_minor": payment.amount_minor,
                "method": payment.method,
                "student": payment.enrollment.student.public_id,
            },
        )
        logger.info(
            "Payment %s recorded for %s by %s",
            payment.public_id,
            payment.enrollment.student.public_id,
            self.request.user.public_id,
        )

    # --- transitions --------------------------------------------------------

    @extend_schema(summary="Approve a payment", request=None, responses={200: PaymentSerializer})
    @action(detail=True, methods=["post"])
    def approve(self, request, public_id=None):
        payment = self.get_object()
        try:
            payment = approve(payment, actor=request.user)
        except TransitionError as exc:
            return _transition_error(exc)
        return Response(PaymentSerializer(payment, context=self.get_serializer_context()).data)

    @extend_schema(
        summary="Reject a payment", request=RejectionSerializer, responses={200: PaymentSerializer}
    )
    @action(detail=True, methods=["post"])
    def reject(self, request, public_id=None):
        payment = self.get_object()
        serializer = RejectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payment = reject(
                payment, actor=request.user, reason=serializer.validated_data["reason"]
            )
        except TransitionError as exc:
            return _transition_error(exc)
        return Response(PaymentSerializer(payment, context=self.get_serializer_context()).data)

    @extend_schema(
        summary="Cancel a pending payment",
        request=CancellationSerializer,
        responses={200: PaymentSerializer},
    )
    @action(detail=True, methods=["post"])
    def cancel(self, request, public_id=None):
        payment = self.get_object()
        serializer = CancellationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Reception may withdraw its own mistaken entry, nobody else's.
        if not has_permission(request.user, "payment.approve") and (
            payment.created_by_id != request.user.pk
        ):
            raise PermissionDenied("You can only cancel a payment you recorded.")

        try:
            payment = cancel(
                payment, actor=request.user, reason=serializer.validated_data.get("reason", "")
            )
        except TransitionError as exc:
            return _transition_error(exc)
        return Response(PaymentSerializer(payment, context=self.get_serializer_context()).data)

    # --- proofs -------------------------------------------------------------

    @extend_schema(summary="List proofs", responses={200: PaymentProofSerializer(many=True)})
    @action(detail=True, methods=["get"])
    def proofs(self, request, public_id=None):
        payment = self.get_object()
        return Response(PaymentProofSerializer(payment.proofs.all(), many=True).data)

    @extend_schema(
        summary="Get a signed upload URL",
        request=ProofUploadRequestSerializer,
        responses={200: None},
        description=(
            "Returns a short-lived POST policy the browser uploads straight to. "
            "Content type and a size ceiling are bound into the signature, so the "
            "bytes never pass through this API."
        ),
    )
    @action(detail=True, methods=["post"], url_path="proofs/upload-url")
    def upload_url(self, request, public_id=None):
        payment = self.get_object()
        serializer = ProofUploadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        content_type = serializer.validated_data["content_type"]
        key = storage.build_proof_key(payment.public_id, content_type)

        try:
            policy = storage.presign_upload(key, content_type)
        except storage.StorageError as exc:
            return Response(
                {"error": {"code": "storage_unavailable", "message": str(exc), "details": {}}},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"storage_key": key, "upload": policy})

    @extend_schema(
        summary="Confirm an upload finished",
        request=ProofConfirmSerializer,
        responses={201: PaymentProofSerializer},
    )
    @action(detail=True, methods=["post"], url_path="proofs/confirm")
    def confirm_proof(self, request, public_id=None):
        payment = self.get_object()
        serializer = ProofConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key = serializer.validated_data["storage_key"]

        # The key must be one we issued for this payment. Otherwise a caller
        # could attach someone else's file to their own payment.
        if not key.startswith(f"proofs/{payment.public_id}/"):
            raise PermissionDenied("That upload does not belong to this payment.")

        try:
            info = storage.head_object(key)
        except storage.StorageError as exc:
            return Response(
                {"error": {"code": "storage_unavailable", "message": str(exc), "details": {}}},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if info is None:
            # The client said it uploaded. It did not.
            return Response(
                {
                    "error": {
                        "code": "upload_missing",
                        "message": "No file was found at that key. Upload it before confirming.",
                        "details": {},
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if info.content_type not in storage.ALLOWED_PROOF_TYPES:
            storage.delete_object(key)
            return Response(
                {
                    "error": {
                        "code": "unsupported_type",
                        "message": f"{info.content_type} is not an accepted proof format.",
                        "details": {},
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        proof = PaymentProof.objects.create(
            payment=payment,
            storage_key=key,
            original_filename=serializer.validated_data["filename"][:255],
            # Taken from the object itself, not from what the client claimed.
            mime_type=info.content_type,
            size_bytes=info.size_bytes,
            checksum_sha256=info.etag if len(info.etag) == 64 else "",
            uploaded_by=request.user,
        )
        record(
            AuditAction.PROOF_UPLOADED,
            actor=request.user,
            obj=payment,
            new={"filename": proof.original_filename, "size_bytes": proof.size_bytes},
        )
        logger.info(
            "Proof %s attached to %s by %s", proof.pk, payment.public_id, request.user.public_id
        )
        return Response(PaymentProofSerializer(proof).data, status=status.HTTP_201_CREATED)


@extend_schema(
    summary="Download a proof",
    responses={200: None},
    description=(
        "Returns a signed URL valid for seconds. The bucket is private; this is "
        "the only route to the bytes."
    ),
)
class ProofDownloadView(APIView):
    permission_classes = [RequirePermission]
    required_permission = "proof.view"

    def get(self, request, pk):
        proof = get_object_or_404(
            scope_proofs(PaymentProof.objects.select_related("payment"), request.user), pk=pk
        )

        if not proof.is_viewable:
            # Uploaded from an institute machine and not yet scanned. Handing
            # out a signed URL for an unscanned file defeats the scan.
            return Response(
                {
                    "error": {
                        "code": "not_yet_scanned",
                        "message": "This file is still being checked. Try again shortly.",
                        "details": {"scan_status": proof.scan_status},
                    }
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            url = storage.presign_download(proof.storage_key, filename=proof.original_filename)
        except storage.StorageError as exc:
            return Response(
                {"error": {"code": "storage_unavailable", "message": str(exc), "details": {}}},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Who looked at a family's bank slip is itself worth recording.
        record(
            AuditAction.PROOF_DOWNLOADED,
            actor=request.user,
            obj=proof.payment,
            new={"filename": proof.original_filename},
        )
        logger.info("Proof %s downloaded by %s", proof.pk, request.user.public_id)
        return Response({"url": url, "expires_in": storage.settings.S3_DOWNLOAD_URL_TTL})


@extend_schema(summary="Balance for one enrolment", responses={200: BalanceSerializer})
class EnrollmentBalanceView(APIView):
    """
    Total, paid, pending and remaining - computed from the payment rows every
    time. Never a stored counter.
    """

    permission_classes = [RequirePermission]
    required_permission = "payment.view"

    def get(self, request, pk):
        enrollment = get_object_or_404(
            scope_enrollments(Enrollment.objects.select_related("course"), request.user), pk=pk
        )
        return Response(BalanceSerializer(enrollment_balance(enrollment)).data)


@extend_schema(
    summary="Mark a proof scanned",
    request=None,
    responses={200: PaymentProofSerializer},
    description="Placeholder for the virus-scanning task that lands with background jobs.",
)
class ProofScanCallbackView(APIView):
    permission_classes = [RequirePermission]
    required_permission = "proof.view"

    def post(self, request, pk):
        proof = get_object_or_404(
            scope_proofs(PaymentProof.objects.select_related("payment"), request.user), pk=pk
        )
        proof.scan_status = ScanStatus.CLEAN
        proof.scanned_at = timezone.now()
        proof.save(update_fields=["scan_status", "scanned_at", "updated_at"])
        return Response(PaymentProofSerializer(proof).data)
