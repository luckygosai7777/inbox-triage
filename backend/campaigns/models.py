"""Bulk-send campaign models.

The campaign never sends mail itself. It renders a message per recipient and
hands the user a Gmail compose deep link; the send click happens in Gmail. The
batch cap and cooldown below exist so a run looks like a person sending mail.
"""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class CampaignState(models.TextChoices):
    IDLE = "idle", "Draft"
    REVIEW = "review", "Reviewing"
    DONE = "done", "Finished"


class Tone(models.TextChoices):
    FORMAL = "Formal", "Formal"
    WARM = "Warm", "Warm"
    DIRECT = "Direct", "Direct"


class Intensity(models.TextChoices):
    TOKENS_ONLY = "Tokens only", "Tokens only"
    TOKENS_PLUS_OPENER = "Tokens + opener", "Tokens + opener"


class Campaign(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="campaigns"
    )
    name = models.CharField(max_length=255, default="Untitled campaign")
    list_name = models.CharField(max_length=255, blank=True)

    step = models.PositiveSmallIntegerField(default=1)
    use_case = models.CharField(max_length=64, default="Job application")
    subject_template = models.CharField(max_length=998, blank=True)
    body_template = models.TextField(blank=True)
    tone = models.CharField(max_length=16, choices=Tone.choices, default=Tone.FORMAL)
    intensity = models.CharField(
        max_length=24, choices=Intensity.choices, default=Intensity.TOKENS_PLUS_OPENER
    )
    grounding = models.TextField(
        blank=True, help_text="Source material the opener must quote"
    )

    state = models.CharField(
        max_length=16, choices=CampaignState.choices, default=CampaignState.IDLE
    )
    cursor = models.PositiveIntegerField(
        default=0, help_text="How many recipients have been reviewed"
    )
    approved = models.BooleanField(
        default=False, help_text="User ticked the send-it-myself checkbox"
    )
    working_hours_only = models.BooleanField(default=True)

    # Rate limiting: at most batch_cap opens per cooldown_hours window.
    batch_cap = models.PositiveIntegerField(default=settings.CAMPAIGN_BATCH_CAP)
    cooldown_hours = models.PositiveIntegerField(
        default=settings.CAMPAIGN_COOLDOWN_HOURS
    )
    window_start = models.DateTimeField(null=True, blank=True)
    window_sent = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return self.name

    # -- rate limiting ----------------------------------------------------

    def window_is_fresh(self, now=None) -> bool:
        """True when the current window has expired and the cap resets."""
        if not self.window_start:
            return True
        now = now or timezone.now()
        elapsed_hours = (now - self.window_start).total_seconds() / 3600
        return elapsed_hours >= self.cooldown_hours

    def window_remaining(self, now=None) -> int:
        if self.window_is_fresh(now):
            return self.batch_cap
        return max(0, self.batch_cap - self.window_sent)

    def window_used(self, now=None) -> int:
        if self.window_is_fresh(now):
            return 0
        return min(self.batch_cap, self.window_sent)

    def window_resets_at(self):
        if not self.window_start or self.window_is_fresh():
            return None
        return self.window_start + timedelta(hours=self.cooldown_hours)

    def record_window_hit(self, now=None) -> None:
        now = now or timezone.now()
        if self.window_is_fresh(now):
            self.window_start = now
            self.window_sent = 1
        else:
            self.window_sent += 1

    @property
    def total_count(self) -> int:
        return self.recipients.count()

    @property
    def remaining_count(self) -> int:
        return max(0, self.total_count - self.cursor)


class CampaignDocument(models.Model):
    """An attachment plus the rule that decides who gets it.

    A blank attach_rule attaches to everyone; otherwise the file goes out only
    when the recipient's role contains the rule text.
    """

    campaign = models.ForeignKey(
        Campaign, on_delete=models.CASCADE, related_name="documents"
    )
    name = models.CharField(max_length=255)
    size = models.PositiveBigIntegerField(default=0)
    attach_rule = models.CharField(max_length=64, blank=True)
    file = models.FileField(upload_to="campaign_docs/", null=True, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return self.name

    def applies_to(self, role: str) -> bool:
        rule = (self.attach_rule or "").strip().lower()
        if not rule:
            return True
        return rule in (role or "").lower()


class CampaignRecipient(models.Model):
    campaign = models.ForeignKey(
        Campaign, on_delete=models.CASCADE, related_name="recipients"
    )
    email = models.EmailField()
    name = models.CharField(max_length=255)
    org = models.CharField(max_length=255, blank=True)
    role = models.CharField(max_length=255, blank=True)
    position = models.PositiveIntegerField(default=0)
    sent_at = models.DateTimeField(null=True, blank=True)
    skipped = models.BooleanField(default=False)

    class Meta:
        ordering = ["position", "id"]
        unique_together = [("campaign", "email")]

    def __str__(self) -> str:
        return f"{self.name} <{self.email}>"

    @property
    def first_name(self) -> str:
        return (self.name or "").split(" ")[0]


class CampaignLogEntry(models.Model):
    """One record per Gmail compose link opened."""

    campaign = models.ForeignKey(
        Campaign, on_delete=models.CASCADE, related_name="log"
    )
    email = models.EmailField()
    org = models.CharField(max_length=255, blank=True)
    note = models.CharField(max_length=255, blank=True)
    documents_attached = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"{self.email} ({self.note})"
