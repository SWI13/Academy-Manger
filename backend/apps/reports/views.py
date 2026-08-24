"""The dashboard endpoint."""

from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.rbac.permissions import IsAuthenticatedAndActive

from .dashboards import build_dashboard


@extend_schema(
    summary="Dashboard for the signed-in user",
    responses={200: None},
    description=(
        "Returns only the tiles the caller's permissions allow. A figure this "
        "endpoint never sends cannot leak through a new screen or the browser's "
        "network tab."
    ),
)
class DashboardView(APIView):
    # No permission codename: every signed-in user has a dashboard. What
    # differs is what it contains, and that is decided tile by tile.
    permission_classes = [IsAuthenticatedAndActive]

    def get(self, request):
        return Response(build_dashboard(request.user))
