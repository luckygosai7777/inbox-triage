"""Campaign serializers."""
from __future__ import annotations

from rest_framework import serializers

from .models import (
    Campaign,
    CampaignDocument,
    CampaignLogEntry,
    CampaignRecipient,
    Intensity,
    Tone,
)
from .services import composer


class CampaignDocumentSerializer(serializers.ModelSerializer):
    rule_label = serializers.SerializerMethodField()
    attaches_to_all = serializers.SerializerMethodField()

    class Meta:
        model = CampaignDocument
        fields = ["id", "name", "size", "attach_rule", "position", "rule_label", "attaches_to_all"]

    def get_attaches_to_all(self, obj) -> bool:
        return not (obj.attach_rule or "").strip()

    def get_rule_label(self, obj) -> str:
        rule = (obj.attach_rule or "").strip()
        return f'Only when the role mentions "{rule}"' if rule else "Attached to everyone"


class CampaignRecipientSerializer(serializers.ModelSerializer):
    document_count = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()

    class Meta:
        model = CampaignRecipient
        fields = [
            "id", "email", "name", "org", "role", "position",
            "sent_at", "skipped", "document_count", "status_label",
        ]
        read_only_fields = ["position", "sent_at", "skipped"]

    def get_document_count(self, obj) -> int:
        documents = self.context.get("documents")
        if documents is None:
            return len(composer.documents_for(obj.campaign, obj))
        return sum(1 for d in documents if d.applies_to(obj.role))

    def get_status_label(self, obj) -> str:
        if obj.sent_at:
            return "Sent"
        return "Skipped" if obj.skipped else "Queued"


class CampaignLogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = CampaignLogEntry
        fields = ["id", "email", "org", "note", "documents_attached", "created_at"]


class CampaignSerializer(serializers.ModelSerializer):
    documents = CampaignDocumentSerializer(many=True, read_only=True)
    recipients = serializers.SerializerMethodField()
    log = serializers.SerializerMethodField()

    total_count = serializers.IntegerField(read_only=True)
    remaining_count = serializers.IntegerField(read_only=True)
    window_used = serializers.SerializerMethodField()
    window_remaining = serializers.SerializerMethodField()
    window_resets_at = serializers.SerializerMethodField()
    on_cooldown = serializers.SerializerMethodField()
    is_grounded = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = [
            "id", "name", "list_name", "step", "use_case",
            "subject_template", "body_template", "tone", "intensity", "grounding",
            "state", "cursor", "approved", "working_hours_only",
            "batch_cap", "cooldown_hours", "window_start", "window_sent",
            "created_at", "updated_at",
            "documents", "recipients", "log",
            "total_count", "remaining_count",
            "window_used", "window_remaining", "window_resets_at", "on_cooldown",
            "is_grounded",
        ]
        read_only_fields = ["state", "cursor", "window_start", "window_sent"]

    def get_recipients(self, obj):
        documents = list(obj.documents.all())
        return CampaignRecipientSerializer(
            obj.recipients.all(), many=True, context={"documents": documents}
        ).data

    def get_log(self, obj):
        return CampaignLogEntrySerializer(obj.log.all()[:20], many=True).data

    def get_window_used(self, obj) -> int:
        return obj.window_used()

    def get_window_remaining(self, obj) -> int:
        return obj.window_remaining()

    def get_window_resets_at(self, obj):
        return obj.window_resets_at()

    def get_on_cooldown(self, obj) -> bool:
        return obj.window_remaining() <= 0

    def get_is_grounded(self, obj) -> bool:
        return bool((obj.grounding or "").strip())

    def validate_tone(self, value):
        if value not in Tone.values:
            raise serializers.ValidationError(f"tone must be one of {Tone.values}")
        return value

    def validate_intensity(self, value):
        if value not in Intensity.values:
            raise serializers.ValidationError(f"intensity must be one of {Intensity.values}")
        return value

    def validate_step(self, value):
        if not 1 <= value <= 4:
            raise serializers.ValidationError("step must be between 1 and 4")
        return value


class AddRecipientSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(min_length=2, max_length=255)
    org = serializers.CharField(required=False, allow_blank=True, max_length=255)
    role = serializers.CharField(required=False, allow_blank=True, max_length=255)


class SendRecordSerializer(serializers.Serializer):
    recipient_id = serializers.IntegerField(required=False)
    skipped = serializers.BooleanField(required=False, default=False)


class DocumentWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    size = serializers.IntegerField(required=False, default=0, min_value=0)
    attach_rule = serializers.CharField(required=False, allow_blank=True, max_length=64)


class CsvImportSerializer(serializers.Serializer):
    text = serializers.CharField(required=False, allow_blank=True)
    list_name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    replace = serializers.BooleanField(required=False, default=True)
