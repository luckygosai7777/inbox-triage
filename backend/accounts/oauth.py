"""Raw Google OAuth 2.0 helpers (no allauth).

Two entry points matter to the rest of the app:

    build_flow()          -- constructs the authorization flow for login
    credentials_for(user) -- returns live google credentials, refreshing and
                             persisting the access token when it has expired
"""
from __future__ import annotations

import logging
import os
import secrets

from django.conf import settings
from django.utils import timezone
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from .models import GoogleCredential, OAuthState

logger = logging.getLogger(__name__)

# Google frequently returns a superset of the requested scopes (it adds the
# openid/profile scopes it decides are implied). Without this, oauthlib raises
# a hard "Scope has changed" error on an otherwise successful exchange.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"


class OAuthNotConfigured(RuntimeError):
    """Raised when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing."""


class CredentialsMissing(RuntimeError):
    """Raised when a user has not connected a Google account yet."""


def _client_config() -> dict:
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise OAuthNotConfigured(
            "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env "
            "(see .env.example) before connecting a Google account."
        )
    return {
        "web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "auth_uri": AUTH_URI,
            "token_uri": TOKEN_URI,
            "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
        }
    }


def build_flow(state: str | None = None) -> Flow:
    flow = Flow.from_client_config(
        _client_config(), scopes=settings.GOOGLE_OAUTH_SCOPES, state=state
    )
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    return flow


def start_authorization(next_url: str = "") -> str:
    """Creates a state row and returns the URL to send the browser to."""
    state = secrets.token_urlsafe(32)
    OAuthState.objects.create(state=state, next_url=next_url)
    # Prune anything that can no longer be redeemed.
    cutoff = timezone.now() - timezone.timedelta(minutes=30)
    OAuthState.objects.filter(created_at__lt=cutoff).delete()

    flow = build_flow(state=state)
    authorization_url, _ = flow.authorization_url(
        access_type="offline",       # we need a refresh token for background sync
        include_granted_scopes="true",
        prompt="consent",            # force a refresh token even on re-auth
    )
    return authorization_url


def consume_state(state: str) -> OAuthState:
    row = OAuthState.objects.filter(state=state).first()
    if row is None:
        raise ValueError("Unknown OAuth state - restart the sign-in flow.")
    if row.is_stale():
        row.delete()
        raise ValueError("OAuth state expired - restart the sign-in flow.")
    row.delete()
    return row


def store_credentials(user, creds: Credentials, email: str) -> GoogleCredential:
    """Persists a credential, keeping any refresh token we already hold.

    Google only returns a refresh token on the first consent; re-auth without
    `prompt=consent` returns none, and blindly overwriting would break sync.
    """
    record, _ = GoogleCredential.objects.get_or_create(user=user)
    record.email = email or record.email
    record.access_token = creds.token or ""
    if creds.refresh_token:
        record.refresh_token = creds.refresh_token
    record.token_uri = creds.token_uri or TOKEN_URI
    record.scopes = list(creds.scopes or settings.GOOGLE_OAUTH_SCOPES)
    if creds.expiry:
        expiry = creds.expiry
        if timezone.is_naive(expiry):
            expiry = timezone.make_aware(expiry, timezone.utc)
        record.expiry = expiry
    record.save()
    return record


def credentials_for(user) -> Credentials:
    """Returns usable Google credentials, refreshing them if needed."""
    record = GoogleCredential.objects.filter(user=user).first()
    if record is None or not record.refresh_token:
        raise CredentialsMissing(
            "No Google account connected. Visit /api/auth/google/start/ first."
        )

    creds = Credentials(
        token=record.access_token or None,
        refresh_token=record.refresh_token,
        token_uri=record.token_uri,
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=record.scopes or settings.GOOGLE_OAUTH_SCOPES,
    )
    if record.expiry:
        creds.expiry = record.expiry.replace(tzinfo=None)

    if not creds.valid:
        logger.info("Refreshing Google access token for %s", record.email)
        creds.refresh(GoogleRequest())
        store_credentials(user, creds, record.email)

    return creds
