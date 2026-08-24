"""
Authentication endpoints.

Session-based. The browser never holds a token: Next.js calls these
server-side and the session cookie stays HttpOnly, which removes the whole
class of token theft by XSS. Deactivating an account takes effect on the very
next request, which a stateless token cannot do without a denylist - and a
denylist is a session store wearing a disguise.
"""

import logging
import secrets

from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.contrib.auth import update_session_auth_hash
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.rbac.permissions import IsAuthenticatedAndActive, RequirePermission

from .serializers import (
    LoginSerializer,
    PasswordChangeSerializer,
    PasswordResetSerializer,
    UserSummarySerializer,
)
from .throttles import LoginIdentifierThrottle, LoginIPThrottle

logger = logging.getLogger(__name__)

# Long enough that guessing is hopeless, short enough to read down a phone line.
TEMPORARY_PASSWORD_LENGTH = 12


@extend_schema(
    summary="Log in",
    request=LoginSerializer,
    responses={200: UserSummarySerializer, 400: None, 429: None},
    auth=[],
)
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginIPThrottle, LoginIdentifierThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            logger.info(
                "Failed login for %r from %s",
                str(request.data.get("identifier"))[:40],
                request.META.get("REMOTE_ADDR"),
            )
            return Response(
                {
                    "error": {
                        "code": "invalid_credentials",
                        "message": "Those details do not match an active account.",
                        "details": {},
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = serializer.validated_data["user"]
        # django_login cycles the session key, so a session fixed before login
        # is not the session the user ends up authenticated on.
        django_login(request, user, backend="apps.accounts.backends.PublicIdOrPhoneBackend")

        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        logger.info("Login succeeded for %s", user.public_id)

        return Response(UserSummarySerializer(user).data, status=status.HTTP_200_OK)


@extend_schema(summary="Log out", request=None, responses={204: None})
class LogoutView(APIView):
    permission_classes = [IsAuthenticatedAndActive]

    def post(self, request):
        public_id = request.user.public_id
        django_logout(request)  # flushes the session server-side, not just the cookie
        logger.info("Logout for %s", public_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(summary="The signed-in user", responses={200: UserSummarySerializer})
class MeView(APIView):
    permission_classes = [IsAuthenticatedAndActive]

    def get(self, request):
        return Response(UserSummarySerializer(request.user).data)


@extend_schema(
    summary="Change your own password",
    request=PasswordChangeSerializer,
    responses={204: None, 400: None},
)
class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticatedAndActive]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])

        # Changing the password changes the session auth hash, which
        # invalidates every other session for this user - a stolen session on
        # a shared reception machine dies here. This call keeps the current
        # one alive so the user is not logged out of the browser they just
        # used to change it.
        update_session_auth_hash(request, user)

        logger.info("Password changed by %s", user.public_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    summary="Reset another user's password",
    request=PasswordResetSerializer,
    responses={200: None, 403: None},
)
class PasswordResetView(APIView):
    """
    Staff-initiated. Returns a temporary password once, in the response, for
    the staff member to pass on. It is never stored in readable form and never
    shown again.
    """

    permission_classes = [RequirePermission]
    required_permission = "user.reset_password"

    def post(self, request):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target = serializer.user
        temporary = secrets.token_urlsafe(TEMPORARY_PASSWORD_LENGTH)
        target.set_password(temporary)
        target.save(update_fields=["password"])

        # Every existing session for the target is now invalid, because the
        # session auth hash derives from the password. A reset locks out
        # whoever was using the account, which is the point of a reset.
        logger.info("Password reset for %s by %s", target.public_id, request.user.public_id)

        return Response(
            {
                "public_id": target.public_id,
                "temporary_password": temporary,
                "message": "Give this to the user. It is not shown again.",
            },
            status=status.HTTP_200_OK,
        )
