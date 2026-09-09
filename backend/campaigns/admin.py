from django.contrib import admin

from .models import Campaign, CampaignDocument, CampaignLogEntry, CampaignRecipient


class RecipientInline(admin.TabularInline):
    model = CampaignRecipient
    extra = 0
    fields = ("position", "email", "name", "org", "role", "sent_at", "skipped")


class DocumentInline(admin.TabularInline):
    model = CampaignDocument
    extra = 0
    fields = ("position", "name", "attach_rule", "size")


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "state", "cursor", "total_count", "updated_at")
    list_filter = ("state", "tone", "intensity")
    search_fields = ("name", "list_name")
    inlines = [DocumentInline, RecipientInline]


@admin.register(CampaignLogEntry)
class CampaignLogEntryAdmin(admin.ModelAdmin):
    list_display = ("email", "campaign", "note", "documents_attached", "created_at")
    search_fields = ("email",)
