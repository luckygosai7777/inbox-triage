"""Auth endpoints: Google OAuth round trip, session identity, sign out."""
from __future__ import annotations

import logging
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.http import HttpResponseRedirect
from django.middleware.csrf import get_token
from googleapiclient.discovery import build
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import GoogleCredential
from .oauth import (
    CredentialsMissing,
    OAuthNotConfigured,
    build_flow,
    consume_state,
    start_authorization,
    store_credentials,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def _frontend_redirect(**params) -> HttpResponseRedirect:
    base = settings.FRONTEND_ORIGIN.rstrip("/")
    return HttpResponseRedirect(f"{base}/?{urlencode(params)}")


@api_view(["GET"])
@permission_classes([AllowAny])
def google_start(request):
    """Returns the Google consent URL (or redirects straight to it)."""
    try:
        url = start_authorization(next_url=request.GET.get("next", ""))
    except OAuthNotConfigured as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    if request.GET.get("redirect") == "1":
        return HttpResponseRedirect(url)
    return Response({"authorization_url": url})


@api_view(["GET"])
@permission_classes([AllowAny])
def google_callback(request):
    """Exchanges the authorization code, then signs the user in.

    The Google account *is* the login: the verified Google email decides which
    Django user this session belongs to.
    """
    error = request.GET.get("error")
    if error:
        return _frontend_redirect(auth_error=error)

    code = request.GET.get("code")
    state = request.GET.get("state", "")
    if not code:
        return _frontend_redirect(auth_error="missing_code")

    try:
        consume_state(state)
    except ValueError as exc:
        return _frontend_redirect(auth_error=str(exc))

    try:
        flow = build_flow(state=state)
        flow.fetch_token(code=code)
    except OAuthNotConfigured as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as exc:  # noqa: BLE001 - surface any exchange failure to the UI
        logger.exception("Google token exchange failed")
        return _frontend_redirect(auth_error=f"token_exchange_failed: {exc}")

    creds = flow.credentials

    try:
        profile = build("oauth2", "v2", credentials=creds).userinfo().get().execute()
    except Exception:  # noqa: BLE001
        logger.exception("Could not read Google userinfo")
        return _frontend_redirect(auth_error="userinfo_failed")

    email = (profile.get("email") or "").lower()
    if not email:
        return _frontend_redirect(auth_error="no_email_on_google_account")

    user, created = User.objects.get_or_create(
        username=email,
        defaults={
            "email": email,
            "first_name": profile.get("given_name", "")[:150],
            "last_name": profile.get("family_name", "")[:150],
        },
    )
    if created:
        # OAuth is the only credential path; no usable password is ever set.
        user.set_unusable_password()
        user.save(update_fields=["password"])

    store_credentials(user, creds, email)
    login(request, user)
    return _frontend_redirect(connected="1")


@api_view(["GET"])
@permission_classes([AllowAny])
def me(request):
    """Identity probe the SPA calls on boot. Also seeds the CSRF cookie."""
    get_token(request)
    if not request.user or not request.user.is_authenticated:
        return Response(
            {
                "authenticated": False,
                # Tells the sign-in screen whether to offer the dev password form.
                "dev_login_available": settings.DEBUG,
                "google_configured": bool(settings.GOOGLE_CLIENT_ID),
            }
        )

    credential = GoogleCredential.objects.filter(user=request.user).first()
    return Response(
        {
            "authenticated": True,
            "email": request.user.email,
            "name": request.user.get_full_name() or request.user.username,
            "google_connected": bool(credential and credential.refresh_token),
            "scopes": credential.scopes if credential else [],
            "last_synced_at": credential.last_synced_at if credential else None,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def dev_login(request):
    """Username/password sign-in for local development only.

    Google OAuth is the real login. This exists so the app can be driven before
    an OAuth client is configured, and it refuses to run unless DEBUG is on -
    a deployment with DEBUG=False has no password path into the API at all.
    """
    if not settings.DEBUG:
        return Response(
            {"detail": "Password sign-in is disabled. Use Google."},
            status=status.HTTP_403_FORBIDDEN,
        )

    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    if not username or not password:
        return Response(
            {"detail": "Username and password are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response(
            {"detail": "That username and password did not match"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    login(request, user)
    return Response({"authenticated": True, "email": user.email, "name": user.get_username()})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sign_out(request):
    logout(request)
    return Response({"authenticated": False})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def disconnect_google(request):
    """Drops stored tokens without deleting the user's triaged mail."""
    deleted, _ = GoogleCredential.objects.filter(user=request.user).delete()
    return Response({"disconnected": bool(deleted)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def connection_status(request):
    """Reports whether the stored credential can actually be used."""
    from .oauth import credentials_for

    try:
        creds = credentials_for(request.user)
    except CredentialsMissing as exc:
        return Response({"usable": False, "detail": str(exc)})
    except Exception as exc:  # noqa: BLE001 - refresh can fail if consent was revoked
        return Response({"usable": False, "detail": f"refresh_failed: {exc}"})
    return Response({"usable": bool(creds and creds.valid), "scopes": list(creds.scopes or [])})
