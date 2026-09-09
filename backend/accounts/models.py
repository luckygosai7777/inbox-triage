"""Google OAuth credential storage.

The refresh token here grants ongoing access to the user's mailbox. It is stored
as issued so the sync job can run without the user present; in production put
this column behind field-level encryption (e.g. django-fernet-fields or a KMS)
rather than leaving it readable to anyone with a database dump.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class GoogleCredential(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="google_credential",
    )
    email = models.EmailField()
    access_token = models.TextField(blank=True)
    refresh_token = models.TextField(blank=True)
    token_uri = models.CharField(
        max_length=255, default="https://oauth2.googleapis.com/token"
    )
    scopes = models.JSONField(default=list, blank=True)
    expiry = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"Google credential for {self.email}"

    @property
    def is_expired(self) -> bool:
        if not self.expiry:
            return False
        return self.expiry <= timezone.now()

    def has_scope(self, scope: str) -> bool:
        return scope in (self.scopes or [])


class OAuthState(models.Model):
    """Short-lived CSRF state for the OAuth round trip.

    Kept in the database rather than the session so the callback works even when
    the SPA and the API sit on different origins.
    """

    state = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    next_url = models.CharField(max_length=500, blank=True)

    def __str__(self) -> str:
        return self.state

    def is_stale(self, max_age_seconds: int = 600) -> bool:
        age = (timezone.now() - self.created_at).total_seconds()
        return age > max_age_seconds
