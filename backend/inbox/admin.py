from django.contrib import admin

from .models import CalendarSlot, MailMessage, MailThread, SlotAssignment, Subscription, VipSender


@admin.register(MailMessage)
class MailMessageAdmin(admin.ModelAdmin):
    list_display = ("subject", "from_name", "from_email", "priority", "needs_reply", "timestamp")
    list_filter = ("priority", "needs_reply", "category", "is_unread", "is_archived")
    search_fields = ("subject", "from_email", "from_name", "preview")
    date_hierarchy = "timestamp"


@admin.register(MailThread)
class MailThreadAdmin(admin.ModelAdmin):
    list_display = ("subject", "latest_timestamp", "brief_confidence", "brief_dismissed")
    list_filter = ("brief_confidence", "brief_dismissed", "is_open")
    search_fields = ("subject", "brief_ask")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("sender_name", "sender_email", "status", "messages_per_month", "last_activity_at")
    list_filter = ("status",)
    search_fields = ("sender_email", "sender_name")


@admin.register(VipSender)
class VipSenderAdmin(admin.ModelAdmin):
    list_display = ("email", "user", "added_at")
    search_fields = ("email",)


@admin.register(CalendarSlot)
class CalendarSlotAdmin(admin.ModelAdmin):
    list_display = ("date", "start_time", "end_time", "title", "is_busy")
    list_filter = ("date", "is_busy")


@admin.register(SlotAssignment)
class SlotAssignmentAdmin(admin.ModelAdmin):
    list_display = ("message", "slot_key", "date")
