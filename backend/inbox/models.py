"""Mail, subscription and calendar models.

Shapes follow the "Data Model" and "Django Models" sections of the design
handoff. Two deliberate departures are noted inline: dormancy is derived rather
than stored, and subscription status drops the "dormant" value.
"""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class Priority(models.IntegerChoices):
    URGENT = 0, "Urgent"
    SOON = 1, "Soon"
    LATER = 2, "Later"


class Confidence(models.TextChoices):
    HIGH = "high", "High"
    LOW = "low", "Low"


class MailThread(models.Model):
    """A Gmail thread plus the parsed VIP brief for its latest message."""

    id = models.CharField(primary_key=True, max_length=64)  # Gmail thread id
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="threads"
    )
    subject = models.CharField(max_length=998, blank=True)
    latest_timestamp = models.DateTimeField(db_index=True)
    is_open = models.BooleanField(default=True)

    # Parsed VIP brief. brief_due_at is only populated when confidence is HIGH;
    # at LOW confidence the UI shows brief_evidence and refuses to assert a date.
    brief_ask = models.CharField(max_length=255, blank=True)
    brief_due_at = models.DateTimeField(null=True, blank=True)
    brief_due_text = models.CharField(max_length=120, blank=True)
    brief_why = models.CharField(max_length=255, blank=True)
    brief_evidence = models.TextField(blank=True)
    brief_confidence = models.CharField(
        max_length=8, choices=Confidence.choices, blank=True
    )
    brief_parsed_at = models.DateTimeField(null=True, blank=True)
    brief_dismissed = models.BooleanField(default=False)

    class Meta:
        ordering = ["-latest_timestamp"]
        indexes = [models.Index(fields=["user", "-latest_timestamp"])]

    def __str__(self) -> str:
        return f"{self.subject or 'no subject'} [{self.id}]"

    @property
    def has_brief(self) -> bool:
        return bool(self.brief_ask)

    @property
    def message_ids(self) -> list[str]:
        return list(self.messages.values_list("id", flat=True))


class MailMessage(models.Model):
    """One Gmail message, enriched with LLM triage fields."""

    id = models.CharField(primary_key=True, max_length=64)  # Gmail message id
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="messages"
    )
    thread = models.ForeignKey(
        MailThread, on_delete=models.CASCADE, related_name="messages"
    )

    from_email = models.EmailField(db_index=True)
    from_name = models.CharField(max_length=255, blank=True)
    to = models.JSONField(default=list, blank=True)
    subject = models.CharField(max_length=998, blank=True)
    preview = models.TextField(blank=True)
    timestamp = models.DateTimeField(db_index=True)

    is_unread = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)
    has_attachment = models.BooleanField(default=False)

    # LLM-derived triage
    category = models.CharField(max_length=64, blank=True)
    priority = models.IntegerField(choices=Priority.choices, default=Priority.LATER)
    needs_reply = models.BooleanField(default=False)
    effort_minutes = models.PositiveIntegerField(
        default=settings.DEFAULT_EFFORT_MINUTES
    )
    # Deadline read out of the message, when one was found.
    due_at = models.DateTimeField(null=True, blank=True)
    topics = models.CharField(
        max_length=255, blank=True, help_text="Space-separated LLM topic keywords"
    )
    classified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["priority", "-timestamp"]
        indexes = [
            models.Index(fields=["user", "priority", "-timestamp"]),
            models.Index(fields=["user", "needs_reply"]),
            models.Index(fields=["user", "from_email"]),
        ]

    def __str__(self) -> str:
        return f"{self.from_name or self.from_email}: {self.subject}"

    @property
    def is_classified(self) -> bool:
        return self.classified_at is not None


class VipSender(models.Model):
    """An address on the user's important-people list."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="vips"
    )
    email = models.EmailField()
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("user", "email")]
        ordering = ["email"]

    def __str__(self) -> str:
        return self.email

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)


class SubscriptionStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    UNSUBSCRIBED = "unsubscribed", "Unsubscribed"
    MUTED = "muted", "Blacklisted"


class Subscription(models.Model):
    """A sender that mails on a list, with engagement counters.

    Departure from the handoff: "dormant" is not a stored status. The UI lets
    the user switch the activity window (30/90/180 days), so dormancy is a
    function of (counters, window) and is computed per request by is_dormant().
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subscriptions"
    )
    sender_email = models.EmailField(db_index=True)
    sender_name = models.CharField(max_length=255, blank=True)
    list_unsubscribe = models.CharField(
        max_length=1024, blank=True, help_text="Raw List-Unsubscribe header"
    )

    # Lifetime counters (handoff-named).
    opens_count = models.PositiveIntegerField(default=0)
    clicks_count = models.PositiveIntegerField(default=0)
    dismissals_count = models.PositiveIntegerField(default=0)
    messages_per_month = models.PositiveIntegerField(default=0)

    # Per-window counters: {"30": [opens, clicks, dismissals], "90": [...], ...}
    window_stats = models.JSONField(default=dict, blank=True)

    status = models.CharField(
        max_length=16,
        choices=SubscriptionStatus.choices,
        default=SubscriptionStatus.ACTIVE,
    )
    muted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_activity_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("user", "sender_email")]
        ordering = ["sender_name", "sender_email"]

    def __str__(self) -> str:
        return self.sender_name or self.sender_email

    def stats_for(self, window_days: int) -> list[int]:
        """Returns [opens, clicks, dismissals] inside window_days."""
        raw = self.window_stats.get(str(window_days)) or [0, 0, 0]
        return [int(x) for x in (list(raw) + [0, 0, 0])[:3]]

    def is_dormant(self, window_days: int | None = None) -> bool:
        window_days = window_days or settings.DORMANT_WINDOW_DAYS
        if self.status != SubscriptionStatus.ACTIVE:
            return False
        opens, clicks, _ = self.stats_for(window_days)
        return opens < settings.DORMANT_OPEN_THRESHOLD and clicks == 0

    @property
    def hold_expires_at(self):
        """Blacklisted senders are held before deletion, so a mute is reversible."""
        if self.status != SubscriptionStatus.MUTED or not self.muted_at:
            return None
        return self.muted_at + timedelta(days=settings.BLACKLIST_HOLD_DAYS)


class CalendarSlot(models.Model):
    """A busy block synced from Google Calendar. Free gaps are derived from these."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="calendar_slots",
    )
    external_id = models.CharField(max_length=255, blank=True)
    date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    title = models.CharField(max_length=255, blank=True)
    is_busy = models.BooleanField(default=True)

    class Meta:
        ordering = ["date", "start_time"]
        indexes = [models.Index(fields=["user", "date"])]

    def __str__(self) -> str:
        return f"{self.date} {self.start_time} {self.title}"

    @staticmethod
    def _to_hours(t) -> float:
        return t.hour + t.minute / 60 + t.second / 3600

    @property
    def start_hour(self) -> float:
        return self._to_hours(self.start_time)

    @property
    def end_hour(self) -> float:
        return self._to_hours(self.end_time)


class SlotAssignment(models.Model):
    """A manual "move this reply to that block" override.

    Cleared wholesale by POST /api/schedule/rebuild/.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="slot_assignments",
    )
    message = models.ForeignKey(
        MailMessage, on_delete=models.CASCADE, related_name="slot_assignments"
    )
    date = models.DateField(default=timezone.localdate)
    slot_key = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("user", "message", "date")]

    def __str__(self) -> str:
        return f"{self.message_id} -> {self.slot_key}"
