"""Serializers for mail, subscriptions, VIPs and the reply schedule."""
from __future__ import annotations

from django.conf import settings
from rest_framework import serializers

from .models import (
    CalendarSlot,
    MailMessage,
    MailThread,
    Priority,
    Subscription,
    VipSender,
)


class MailMessageSerializer(serializers.ModelSerializer):
    priority_label = serializers.SerializerMethodField()
    is_vip = serializers.SerializerMethodField()
    show_address = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()

    class Meta:
        model = MailMessage
        fields = [
            "id", "thread_id", "from_email", "from_name", "to", "subject",
            "preview", "timestamp", "is_unread", "is_archived", "has_attachment",
            "category", "priority", "priority_label", "needs_reply",
            "effort_minutes", "due_at", "topics", "is_vip", "show_address", "score",
        ]

    def get_priority_label(self, obj) -> str:
        return Priority(obj.priority).label

    def get_is_vip(self, obj) -> bool:
        return obj.from_email in self.context.get("vip_emails", set())

    def get_show_address(self, obj) -> bool:
        # Set by the search view when the query matched a sender or address.
        return obj.id in self.context.get("person_hits", set())

    def get_score(self, obj) -> int:
        return self.context.get("scores", {}).get(obj.id, 0)


class VipBriefSerializer(serializers.ModelSerializer):
    """The Ask / Due / Why brief shown in the inbox banner."""

    from_name = serializers.SerializerMethodField()
    from_email = serializers.SerializerMethodField()
    message_id = serializers.SerializerMethodField()
    due_is_confirmed = serializers.SerializerMethodField()

    class Meta:
        model = MailThread
        fields = [
            "id", "subject", "latest_timestamp", "message_id",
            "from_name", "from_email",
            "brief_ask", "brief_why", "brief_evidence",
            "brief_due_at", "brief_due_text", "brief_confidence",
            "due_is_confirmed", "brief_dismissed",
        ]

    def _latest(self, obj):
        if not hasattr(obj, "_latest_message"):
            obj._latest_message = obj.messages.order_by("-timestamp").first()
        return obj._latest_message

    def get_from_name(self, obj) -> str:
        latest = self._latest(obj)
        return latest.from_name if latest else ""

    def get_from_email(self, obj) -> str:
        latest = self._latest(obj)
        return latest.from_email if latest else ""

    def get_message_id(self, obj) -> str:
        latest = self._latest(obj)
        return latest.id if latest else ""

    def get_due_is_confirmed(self, obj) -> bool:
        """False means the UI must not state a date - only the evidence."""
        return obj.brief_confidence == "high" and obj.brief_due_at is not None


class ThreadDetailSerializer(serializers.ModelSerializer):
    messages = MailMessageSerializer(many=True, read_only=True)
    brief = serializers.SerializerMethodField()

    class Meta:
        model = MailThread
        fields = ["id", "subject", "latest_timestamp", "is_open", "messages", "brief"]

    def get_brief(self, obj):
        if not obj.has_brief:
            return None
        return VipBriefSerializer(obj, context=self.context).data


class SubscriptionSerializer(serializers.ModelSerializer):
    opens = serializers.SerializerMethodField()
    clicks = serializers.SerializerMethodField()
    dismissals = serializers.SerializerMethodField()
    is_dormant = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()
    activity_label = serializers.SerializerMethodField()
    can_unsubscribe = serializers.SerializerMethodField()
    hold_expires_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Subscription
        fields = [
            "id", "sender_email", "sender_name", "status", "status_label",
            "opens", "clicks", "dismissals", "is_dormant", "activity_label",
            "messages_per_month", "last_activity_at", "hold_expires_at",
            "can_unsubscribe",
        ]

    @property
    def _window(self) -> int:
        return self.context.get("window_days", settings.DORMANT_WINDOW_DAYS)

    def get_opens(self, obj) -> int:
        return obj.stats_for(self._window)[0]

    def get_clicks(self, obj) -> int:
        return obj.stats_for(self._window)[1]

    def get_dismissals(self, obj) -> int:
        return obj.stats_for(self._window)[2]

    def get_is_dormant(self, obj) -> bool:
        return obj.is_dormant(self._window)

    def get_status_label(self, obj) -> str:
        if obj.status == "muted":
            return "Blacklisted"
        if obj.status == "unsubscribed":
            return "Unsubscribed"
        return "No activity" if obj.is_dormant(self._window) else "Active"

    def get_activity_label(self, obj) -> str:
        opens, clicks, dismissed = obj.stats_for(self._window)
        if opens == 0 and clicks == 0:
            return f"{dismissed} dismissed unread" if dismissed else "never opened"
        return f"{opens} opened - {clicks} clicked"

    def get_can_unsubscribe(self, obj) -> bool:
        return bool(obj.list_unsubscribe)


class VipSenderSerializer(serializers.ModelSerializer):
    initials = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = VipSender
        fields = ["id", "email", "added_at", "initials", "display_name"]

    def _name(self, obj) -> str:
        known = self.context.get("names", {})
        return known.get(obj.email) or obj.email.split("@")[0].replace(".", " ").title()

    def get_display_name(self, obj) -> str:
        return self._name(obj)

    def get_initials(self, obj) -> str:
        return self._name(obj)[:2].upper()


class CalendarSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalendarSlot
        fields = ["id", "date", "start_time", "end_time", "title", "is_busy"]


class AssignSerializer(serializers.Serializer):
    message_ids = serializers.ListField(child=serializers.CharField(), allow_empty=False)
    slot_key = serializers.CharField(max_length=32)
    date = serializers.DateField(required=False)


class BulkIdsSerializer(serializers.Serializer):
    message_ids = serializers.ListField(child=serializers.CharField(), allow_empty=False)
