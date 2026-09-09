from django.contrib import admin

from .models import GoogleCredential


@admin.register(GoogleCredential)
class GoogleCredentialAdmin(admin.ModelAdmin):
    list_display = ("user", "email", "expiry", "last_synced_at")
    readonly_fields = ("access_token", "refresh_token")
