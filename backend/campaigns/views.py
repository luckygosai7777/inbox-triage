"""Campaign endpoints.

Nothing here sends mail. `send_record` is called *after* the user has opened a
Gmail compose tab; it advances the cursor, writes the log entry and charges the
rate-limit window. The actual send is a click inside Gmail.
"""
from __future__ import annotations

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import (
    Campaign,
    CampaignDocument,
    CampaignLogEntry,
    CampaignRecipient,
    CampaignState,
)
from .serializers import (
    AddRecipientSerializer,
    CampaignDocumentSerializer,
    CampaignRecipientSerializer,
    CampaignSerializer,
    CsvImportSerializer,
    DocumentWriteSerializer,
    SendRecordSerializer,
)
from .services import composer, csv_import


def _get_campaign(request, campaign_id: int) -> Campaign:
    return get_object_or_404(
        Campaign.objects.prefetch_related("documents", "recipients", "log"),
        user=request.user,
        id=campaign_id,
    )


@api_view(["GET", "POST"])
def campaign_collection(request):
    """GET lists campaigns; POST creates one seeded from a use case."""
    if request.method == "GET":
        rows = Campaign.objects.filter(user=request.user).prefetch_related(
            "documents", "recipients", "log"
        )
        return Response({"results": CampaignSerializer(rows, many=True).data})

    use_case = request.data.get("use_case", "Job application")
    template = composer.USE_CASES.get(use_case)
    if template is None:
        return Response(
            {"detail": f"use_case must be one of {sorted(composer.USE_CASES)}"}, status=400
        )

    campaign = Campaign.objects.create(
        user=request.user,
        name=request.data.get("name") or "Untitled campaign",
        list_name=request.data.get("list_name", ""),
        use_case=use_case,
        subject_template=request.data.get("subject_template") or template["subject"],
        body_template=request.data.get("body_template") or template["body"],
    )
    return Response(CampaignSerializer(campaign).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
def campaign_detail(request, campaign_id: int):
    campaign = _get_campaign(request, campaign_id)

    if request.method == "DELETE":
        campaign.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == "PATCH":
        data = dict(request.data)
        # Switching use case reseeds the templates unless the caller overrides.
        new_use_case = data.get("use_case")
        if new_use_case and new_use_case != campaign.use_case:
            template = composer.USE_CASES.get(new_use_case)
            if template is None:
                return Response(
                    {"detail": f"use_case must be one of {sorted(composer.USE_CASES)}"},
                    status=400,
                )
            data.setdefault("subject_template", template["subject"])
            data.setdefault("body_template", template["body"])

        serializer = CampaignSerializer(campaign, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        campaign.refresh_from_db()

    return Response(CampaignSerializer(campaign).data)


# ----------------------------------------------------------- step 1: docs


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def campaign_documents(request, campaign_id: int):
    """Adds attachments. Accepts uploaded files or plain metadata."""
    campaign = _get_campaign(request, campaign_id)
    position = campaign.documents.count()
    created = []

    for upload in request.FILES.getlist("files"):
        created.append(
            CampaignDocument.objects.create(
                campaign=campaign,
                name=upload.name[:255],
                size=upload.size,
                attach_rule=request.data.get("attach_rule", "")[:64],
                file=upload,
                position=position + len(created),
            )
        )

    if not created and request.data.get("name"):
        serializer = DocumentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        created.append(
            CampaignDocument.objects.create(
                campaign=campaign, position=position, **serializer.validated_data
            )
        )

    if not created:
        return Response({"detail": "Provide a file upload or a document name"}, status=400)

    return Response(
        {"documents": CampaignDocumentSerializer(created, many=True).data},
        status=status.HTTP_201_CREATED,
    )


@api_view(["PATCH", "DELETE"])
def campaign_document_detail(request, campaign_id: int, document_id: int):
    campaign = _get_campaign(request, campaign_id)
    document = get_object_or_404(CampaignDocument, campaign=campaign, id=document_id)

    if request.method == "DELETE":
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    document.attach_rule = (request.data.get("attach_rule") or "")[:64]
    document.save(update_fields=["attach_rule"])
    return Response(CampaignDocumentSerializer(document).data)


# ------------------------------------------------------ step 2: recipients


@api_view(["POST"])
def campaign_add_recipient(request, campaign_id: int):
    """POST /api/campaigns/{id}/add-recipient/ - one recipient by hand."""
    campaign = _get_campaign(request, campaign_id)
    serializer = AddRecipientSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    email = data["email"].lower()

    if campaign.recipients.filter(email=email).exists():
        return Response({"detail": "That address is already on the list"}, status=409)

    last = campaign.recipients.order_by("-position").first()
    recipient = CampaignRecipient.objects.create(
        campaign=campaign,
        email=email,
        name=data["name"].strip(),
        org=(data.get("org") or "").strip() or email.split("@")[-1].split(".")[0].title(),
        role=(data.get("role") or "").strip() or "there",
        position=(last.position + 1) if last else 0,
    )
    return Response(
        CampaignRecipientSerializer(
            recipient, context={"documents": list(campaign.documents.all())}
        ).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["DELETE"])
def campaign_recipient_detail(request, campaign_id: int, recipient_id: int):
    campaign = _get_campaign(request, campaign_id)
    recipient = get_object_or_404(CampaignRecipient, campaign=campaign, id=recipient_id)

    position = recipient.position
    if position < campaign.cursor:
        return Response({"detail": "Already reviewed - cannot remove"}, status=409)

    with transaction.atomic():
        recipient.delete()
        # Keep positions contiguous so the cursor keeps pointing at the right row.
        for index, row in enumerate(campaign.recipients.order_by("position", "id")):
            if row.position != index:
                CampaignRecipient.objects.filter(pk=row.pk).update(position=index)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def campaign_import_recipients(request, campaign_id: int):
    """Replaces (or appends to) the recipient list from a CSV."""
    campaign = _get_campaign(request, campaign_id)
    serializer = CsvImportSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    options = serializer.validated_data

    text = options.get("text") or ""
    list_name = options.get("list_name") or ""
    upload = request.FILES.get("file")
    if upload:
        text = upload.read().decode("utf-8", errors="replace")
        list_name = list_name or upload.name

    if not text.strip():
        return Response({"detail": "Provide CSV text or a file"}, status=400)

    parsed = csv_import.parse_recipients(text)
    if not parsed.rows:
        return Response(
            {"detail": "No valid rows found", "skipped": parsed.skipped[:10]}, status=400
        )

    with transaction.atomic():
        if options.get("replace", True):
            campaign.recipients.all().delete()
            campaign.cursor = 0
        start = campaign.recipients.count()
        existing = set(campaign.recipients.values_list("email", flat=True))
        rows = []
        for offset, row in enumerate(r for r in parsed.rows if r["email"] not in existing):
            rows.append(CampaignRecipient(campaign=campaign, position=start + offset, **row))
        CampaignRecipient.objects.bulk_create(rows)
        if list_name:
            campaign.list_name = list_name[:255]
        campaign.save(update_fields=["list_name", "cursor"])

    campaign.refresh_from_db()
    return Response(
        {
            "imported": len(rows),
            "skipped": parsed.skipped[:10],
            "skipped_count": len(parsed.skipped),
            "detected_headers": parsed.detected_headers,
            "fields": parsed.fields_seen,
            "campaign": CampaignSerializer(campaign).data,
        }
    )


# -------------------------------------------------- step 3: preview / send


@api_view(["GET"])
def campaign_preview(request, campaign_id: int):
    """Renders the message for one recipient, with AI-written parts marked."""
    campaign = _get_campaign(request, campaign_id)
    recipients = list(campaign.recipients.all())
    if not recipients:
        return Response({"detail": "Add recipients first"}, status=400)

    recipient_id = request.GET.get("recipient_id")
    if recipient_id:
        recipient = next((r for r in recipients if str(r.id) == str(recipient_id)), None)
        if recipient is None:
            return Response({"detail": "Unknown recipient"}, status=404)
    else:
        try:
            index = max(0, min(int(request.GET.get("index", 0)), len(recipients) - 1))
        except ValueError:
            index = 0
        recipient = recipients[index]

    payload = composer.render_for(campaign, recipient)
    payload["is_grounded"] = bool((campaign.grounding or "").strip())
    return Response(payload)


@api_view(["POST"])
def campaign_begin_review(request, campaign_id: int):
    """Moves a campaign into review once the user has ticked the checkbox."""
    campaign = _get_campaign(request, campaign_id)
    if not campaign.approved:
        return Response(
            {"detail": "Tick the send-it-myself checkbox before reviewing"}, status=400
        )
    if not campaign.recipients.exists():
        return Response({"detail": "Add recipients first"}, status=400)

    campaign.state = CampaignState.REVIEW
    campaign.save(update_fields=["state"])
    return Response(CampaignSerializer(campaign).data)


@api_view(["GET"])
def campaign_next(request, campaign_id: int):
    """The recipient the review step is currently pointing at."""
    campaign = _get_campaign(request, campaign_id)
    recipient = campaign.recipients.filter(position__gte=campaign.cursor).first()
    if recipient is None:
        return Response({"next": None, "state": campaign.state})

    payload = composer.render_for(campaign, recipient)
    payload["window_remaining"] = campaign.window_remaining()
    payload["can_send"] = campaign.window_remaining() > 0
    payload["resets_at"] = campaign.window_resets_at()
    return Response({"next": payload, "state": campaign.state})


@api_view(["POST"])
def campaign_send_record(request, campaign_id: int):
    """POST /api/campaigns/{id}/send-record/ - records an opened compose tab.

    Called after the browser opens the Gmail link. Refuses once the batch cap
    for the current window is spent.
    """
    campaign = _get_campaign(request, campaign_id)
    serializer = SendRecordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    recipient = (
        campaign.recipients.filter(id=data["recipient_id"]).first()
        if data.get("recipient_id")
        else campaign.recipients.filter(position__gte=campaign.cursor).first()
    )
    if recipient is None:
        return Response({"detail": "Nothing left to review"}, status=400)

    skipped = data.get("skipped", False)
    if not skipped and campaign.window_remaining() <= 0:
        return Response(
            {
                "detail": "Batch limit reached for this window",
                "resets_at": campaign.window_resets_at(),
                "batch_cap": campaign.batch_cap,
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    with transaction.atomic():
        if skipped:
            recipient.skipped = True
            recipient.save(update_fields=["skipped"])
        else:
            recipient.sent_at = timezone.now()
            recipient.save(update_fields=["sent_at"])
            campaign.record_window_hit()
            CampaignLogEntry.objects.create(
                campaign=campaign,
                email=recipient.email,
                org=recipient.org,
                note=composer.log_note(campaign, recipient),
                documents_attached=len(composer.documents_for(campaign, recipient)),
            )

        campaign.cursor = recipient.position + 1
        if campaign.cursor >= campaign.recipients.count():
            campaign.state = CampaignState.DONE
        campaign.save(update_fields=["cursor", "state", "window_start", "window_sent"])

    campaign.refresh_from_db()
    return Response(CampaignSerializer(campaign).data)


@api_view(["POST"])
def campaign_reset(request, campaign_id: int):
    """Starts the run over. Skipped recipients come back into the queue."""
    campaign = _get_campaign(request, campaign_id)
    with transaction.atomic():
        campaign.recipients.update(sent_at=None, skipped=False)
        campaign.log.all().delete()
        campaign.state = CampaignState.IDLE
        campaign.cursor = 0
        campaign.approved = False
        campaign.step = 1
        campaign.window_start = None
        campaign.window_sent = 0
        campaign.save()
    return Response(CampaignSerializer(campaign).data)


@api_view(["GET"])
def campaign_use_cases(request):
    """The starter templates behind the use-case picker."""
    return Response(
        {
            "use_cases": [
                {"label": key, "subject": value["subject"], "body": value["body"]}
                for key, value in composer.USE_CASES.items()
            ],
            "tokens": ["[first]", "[name]", "[org]", "[role]"],
            "tones": list(composer.SIGNOFFS.keys()),
            "intensities": ["Tokens only", "Tokens + opener"],
        }
    )
