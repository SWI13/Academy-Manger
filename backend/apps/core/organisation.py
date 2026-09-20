"""
The institute's own details, read by every printed document.

One endpoint, two audiences. Everybody signed in may *read* it, because the
header of every report and receipt is built from it and a receptionist
printing one is not exercising a special power. Only `settings.manage` may
change it, which in the seed matrix is the owner alone.

That permission has existed since Phase 5 and governed nothing. This is what
it was reserved for.
"""

import logging

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditAction
from apps.audit.services import diff, record, snapshot
from apps.rbac.permissions import IsAuthenticatedAndActive
from apps.rbac.services import has_permission

from .models import Organisation

logger = logging.getLogger(__name__)

#: What a change to the profile records. Every field on it is worth a line in
#: the log - this is the text on every receipt the institute issues.
TRACKED = [
    "name",
    "legal_name",
    "address_line",
    "city",
    "wilaya",
    "phone",
    "email",
    "website",
    "registration_number",
    "tagline",
    "print_footer",
]


class OrganisationSerializer(serializers.ModelSerializer):
    # Composed on the server rather than in each of the fifteen print
    # templates, so "address" means the same thing on a receipt and on a
    # register.
    address = serializers.CharField(read_only=True)
    contact_line = serializers.CharField(read_only=True)
    # Whether the caller may change any of this, so the settings screen does
    # not have to work it out from a permission list of its own.
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = Organisation
        fields = [
            "name",
            "legal_name",
            "address_line",
            "city",
            "wilaya",
            "address",
            "phone",
            "email",
            "website",
            "contact_line",
            "registration_number",
            "tagline",
            "print_footer",
            "can_manage",
            "updated_at",
        ]
        read_only_fields = ["address", "contact_line", "can_manage", "updated_at"]

    def get_can_manage(self, _organisation) -> bool:
        request = self.context.get("request")
        return bool(request and has_permission(request.user, "settings.manage"))

    def validate_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            # Every printed document opens with this. An institute with no
            # name produces a sheet of paper nobody can attribute.
            raise serializers.ValidationError("The organisation needs a name.")
        return name


class OrganisationView(APIView):
    """
    `GET` for anybody signed in, `PATCH` for `settings.manage`.

    Not a ScopedModelViewSet: there is exactly one row and no per-user scope
    to apply. The two gates are still both here - the class refuses a
    deactivated account, and the write path checks the codename explicitly
    rather than relying on the screen not offering the form.
    """

    permission_classes = [IsAuthenticatedAndActive]

    @extend_schema(
        summary="The organisation's own details",
        responses={200: OrganisationSerializer},
    )
    def get(self, request):
        return Response(
            OrganisationSerializer(Organisation.load(), context={"request": request}).data
        )

    @extend_schema(
        summary="Edit the organisation's details",
        request=OrganisationSerializer,
        responses={200: OrganisationSerializer},
    )
    def patch(self, request):
        if not has_permission(request.user, "settings.manage"):
            # Explicit rather than inherited. This is the one write in the
            # platform that is not behind a viewset's action map, so the check
            # has to be written out where it cannot be forgotten.
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Your role does not include managing settings.")

        organisation = Organisation.load()
        before = snapshot(organisation, TRACKED)

        serializer = OrganisationSerializer(
            organisation, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)

        old, new = diff(before, snapshot(organisation, TRACKED))
        if old or new:
            record(
                AuditAction.ORGANISATION_UPDATED,
                actor=request.user,
                obj=organisation,
                old=old,
                new=new,
            )
            logger.info(
                "Organisation profile updated by %s: %s",
                request.user.public_id,
                sorted(new),
            )

        return Response(serializer.data)
