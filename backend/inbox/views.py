"""Mail, subscription, VIP and schedule endpoints."""
from __future__ import annotations

import logging

from django.conf import settings
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.oauth import CredentialsMissing, OAuthNotConfigured

from .models import (
    MailMessage,
    MailThread,
    Priority,
    SlotAssignment,
    Subscription,
    SubscriptionStatus,
    VipSender,
)
from .serializers import (
    AssignSerializer,
    BulkIdsSerializer,
    MailMessageSerializer,
    SubscriptionSerializer,
    ThreadDetailSerializer,
    VipBriefSerializer,
    VipSenderSerializer,
)
from .services import gmail, scheduler, search as search_service, subscriptions as subs_service

logger = logging.getLogger(__name__)

FILTERS = ["All", "Needs reply", "Clients", "Newsletters", "Receipts"]


def _vip_emails(user) -> set[str]:
    return set(VipSender.objects.filter(user=user).values_list("email", flat=True))


def _muted_emails(user) -> set[str]:
    return set(
        Subscription.objects.filter(user=user, status=SubscriptionStatus.MUTED).values_list(
            "sender_email", flat=True
        )
    )


def _base_queryset(user):
    """Live inbox mail: not archived, not from a blacklisted sender."""
    return MailMessage.objects.filter(user=user, is_archived=False).exclude(
        from_email__in=_muted_emails(user)
    )


def _apply_named_filter(queryset, name: str):
    if not name or name == "All":
        return queryset
    if name == "Needs reply":
        return queryset.filter(needs_reply=True)
    return queryset.filter(category__iexact=name)


# ------------------------------------------------------------------- mail


@api_view(["GET"])
def mail_list(request):
    """GET /api/mail/ - search, filter and sort the inbox."""
    user = request.user
    queryset = _apply_named_filter(_base_queryset(user), request.GET.get("filter", "All"))

    if (category := request.GET.get("category")):
        queryset = queryset.filter(category__iexact=category)
    if (priority := request.GET.get("priority")) not in (None, ""):
        try:
            queryset = queryset.filter(priority=int(priority))
        except ValueError:
            return Response({"detail": "priority must be 0, 1 or 2"}, status=400)
    if (needs_reply := request.GET.get("needs_reply")) is not None:
        queryset = queryset.filter(needs_reply=needs_reply.lower() in {"1", "true", "yes"})
    if request.GET.get("vip") in {"1", "true"}:
        queryset = queryset.filter(from_email__in=_vip_emails(user))

    messages = list(queryset)

    query = request.GET.get("search", "")
    hits = search_service.search(messages, query)

    sort_by = request.GET.get("sort", "priority")
    if not query:
        if sort_by == "date":
            hits.sort(key=lambda h: h.message.timestamp, reverse=True)
        elif sort_by == "effort":
            hits.sort(key=lambda h: h.message.effort_minutes)
        else:
            hits.sort(key=lambda h: (h.message.priority, -h.message.timestamp.timestamp()))

    try:
        limit = max(1, min(500, int(request.GET.get("limit", 200))))
        offset = max(0, int(request.GET.get("offset", 0)))
    except ValueError:
        return Response({"detail": "limit and offset must be integers"}, status=400)

    page = hits[offset : offset + limit]
    context = {
        "vip_emails": _vip_emails(user),
        "person_hits": {h.message.id for h in page if h.matched_person},
        "scores": {h.message.id: h.score for h in page},
    }
    data = MailMessageSerializer([h.message for h in page], many=True, context=context).data

    return Response(
        {
            "count": len(hits),
            "limit": limit,
            "offset": offset,
            "results": data,
            "filters": _filter_counts(user),
        }
    )


def _filter_counts(user) -> list[dict]:
    base = _base_queryset(user)
    counts = []
    for name in FILTERS:
        counts.append({"label": name, "count": _apply_named_filter(base, name).count()})
    return counts


@api_view(["GET"])
def mail_detail(request, message_id: str):
    """GET /api/mail/{id}/ - the whole thread the message belongs to."""
    message = get_object_or_404(MailMessage, user=request.user, id=message_id)
    thread = (
        MailThread.objects.filter(user=request.user, id=message.thread_id)
        .prefetch_related("messages")
        .first()
    )
    context = {"vip_emails": _vip_emails(request.user)}
    return Response(ThreadDetailSerializer(thread, context=context).data)


@api_view(["POST"])
def mail_archive(request, message_id: str):
    """POST /api/mail/{id}/archive/ - archives the whole thread in Gmail."""
    message = get_object_or_404(MailMessage, user=request.user, id=message_id)
    try:
        ok = gmail.archive_thread(request.user, message.thread_id)
    except (CredentialsMissing, OAuthNotConfigured) as exc:
        # No Gmail connection: still archive locally so the UI stays coherent.
        MailMessage.objects.filter(user=request.user, thread_id=message.thread_id).update(
            is_archived=True
        )
        return Response({"archived": True, "remote": False, "detail": str(exc)})
    return Response({"archived": ok, "remote": ok})


@api_view(["POST"])
def mail_flag_vip(request, message_id: str):
    """POST /api/mail/{id}/flag-vip/ - adds the sender to the important list."""
    message = get_object_or_404(MailMessage, user=request.user, id=message_id)
    vip, created = VipSender.objects.get_or_create(
        user=request.user, email=message.from_email
    )
    return Response(
        {"created": created, "vip": VipSenderSerializer(vip).data},
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["POST"])
def mail_bulk_delete(request):
    """POST /api/mail/bulk-delete/ - moves selected mail to Gmail's trash."""
    serializer = BulkIdsSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    ids = list(
        MailMessage.objects.filter(
            user=request.user, id__in=serializer.validated_data["message_ids"]
        ).values_list("id", flat=True)
    )
    try:
        moved = gmail.trash_messages(request.user, ids)
    except (CredentialsMissing, OAuthNotConfigured) as exc:
        MailMessage.objects.filter(user=request.user, id__in=ids).delete()
        return Response({"deleted": len(ids), "remote": False, "detail": str(exc)})
    return Response({"deleted": moved, "remote": True})


@api_view(["POST"])
def mail_sync(request):
    """POST /api/mail/sync/ - pulls the latest messages from Gmail."""
    try:
        max_results = int(request.data.get("max_results", settings.GMAIL_SYNC_MAX_RESULTS))
    except (TypeError, ValueError):
        return Response({"detail": "max_results must be an integer"}, status=400)

    try:
        result = gmail.sync_inbox(request.user, max_results=max_results)
    except (CredentialsMissing, OAuthNotConfigured) as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    except Exception as exc:  # noqa: BLE001 - report sync failure without a 500 page
        logger.exception("Gmail sync failed")
        return Response({"detail": f"sync failed: {exc}"}, status=status.HTTP_502_BAD_GATEWAY)

    try:
        gmail.sync_calendar(request.user)
    except Exception as exc:  # noqa: BLE001 - calendar is optional
        logger.warning("Calendar sync skipped: %s", exc)

    return Response(result.as_dict())


@api_view(["GET"])
def metrics(request):
    """GET /api/metrics/ - the three inbox metric cards."""
    user = request.user
    base = _base_queryset(user)
    # Aliases are prefixed: an aggregate may not share a name with a field.
    aggregate = base.aggregate(
        n_needs_reply=Count("id", filter=Q(needs_reply=True)),
        n_clearable=Count("id", filter=Q(needs_reply=False, priority=Priority.LATER)),
        n_unread=Count("id", filter=Q(is_unread=True)),
    )
    window = _window_days(request)
    dormant_rows = subs_service.dormant(user, window)

    return Response(
        {
            "needs_reply": aggregate["n_needs_reply"],
            "clearable": aggregate["n_clearable"],
            "unread": aggregate["n_unread"],
            "dormant_count": len(dormant_rows),
            "dormant_volume": sum(s.messages_per_month for s in dormant_rows),
            "window_days": window,
        }
    )


@api_view(["GET"])
def vip_brief(request):
    """GET /api/mail/vip-brief/ - the highest-priority open VIP thread."""
    user = request.user
    vips = _vip_emails(user)
    if not vips:
        return Response({"brief": None})

    message = (
        _base_queryset(user)
        .filter(from_email__in=vips, thread__brief_dismissed=False)
        .select_related("thread")
        .order_by("priority", "-timestamp")
        .first()
    )
    if message is None or not message.thread.has_brief:
        return Response({"brief": None})
    return Response({"brief": VipBriefSerializer(message.thread).data})


@api_view(["POST"])
def vip_brief_dismiss(request, thread_id: str):
    thread = get_object_or_404(MailThread, user=request.user, id=thread_id)
    thread.brief_dismissed = True
    thread.save(update_fields=["brief_dismissed"])
    return Response({"dismissed": True})


# -------------------------------------------------------------------- VIPs


@api_view(["GET", "POST"])
def vip_collection(request):
    user = request.user
    if request.method == "POST":
        email = (request.data.get("email") or "").strip().lower()
        if "@" not in email or "." not in email.split("@")[-1]:
            return Response({"detail": "A valid email address is required"}, status=400)
        vip, created = VipSender.objects.get_or_create(user=user, email=email)
        return Response(
            VipSenderSerializer(vip, context=_vip_context(user)).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    rows = VipSender.objects.filter(user=user)
    data = VipSenderSerializer(rows, many=True, context=_vip_context(user)).data
    message_count = _base_queryset(user).filter(from_email__in=_vip_emails(user)).count()
    return Response({"results": data, "message_count": message_count})


def _vip_context(user) -> dict:
    """Maps VIP addresses to the display name seen on their mail."""
    names = {}
    for from_email, from_name in MailMessage.objects.filter(user=user).values_list(
        "from_email", "from_name"
    ):
        if from_name and from_email not in names:
            names[from_email] = from_name
    return {"names": names}


@api_view(["DELETE"])
def vip_detail(request, vip_id: int):
    vip = get_object_or_404(VipSender, user=request.user, id=vip_id)
    vip.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ----------------------------------------------------------- subscriptions


def _window_days(request) -> int:
    try:
        window = int(request.GET.get("window", settings.DORMANT_WINDOW_DAYS))
    except (TypeError, ValueError):
        return settings.DORMANT_WINDOW_DAYS
    return window if window in subs_service.WINDOWS else settings.DORMANT_WINDOW_DAYS


@api_view(["GET"])
def subscription_list(request):
    user = request.user
    window = _window_days(request)
    rows = Subscription.objects.filter(user=user)
    if request.GET.get("status"):
        rows = rows.filter(status=request.GET["status"])

    data = SubscriptionSerializer(rows, many=True, context={"window_days": window}).data
    dormant_rows = subs_service.dormant(user, window)
    return Response(
        {
            "results": data,
            "window_days": window,
            "dormant_count": len(dormant_rows),
            "dormant_volume": sum(s.messages_per_month for s in dormant_rows),
        }
    )


@api_view(["GET"])
def subscription_dormant(request):
    """GET /api/subscriptions/dormant/ - senders with no engagement in-window."""
    window = _window_days(request)
    rows = subs_service.dormant(request.user, window)
    return Response(
        {
            "results": SubscriptionSerializer(
                rows, many=True, context={"window_days": window}
            ).data,
            "window_days": window,
            "count": len(rows),
            "volume_per_month": sum(s.messages_per_month for s in rows),
        }
    )


def _subscription_action(request, subscription_id, action):
    subscription = get_object_or_404(Subscription, user=request.user, id=subscription_id)
    payload = action(subscription)
    window = _window_days(request)
    body = SubscriptionSerializer(subscription, context={"window_days": window}).data
    if isinstance(payload, dict):
        body = {**body, **payload}
    return Response(body)


@api_view(["POST"])
def subscription_unsubscribe(request, subscription_id: int):
    return _subscription_action(
        request, subscription_id, lambda s: subs_service.unsubscribe(request.user, s)
    )


@api_view(["POST"])
def subscription_blacklist(request, subscription_id: int):
    return _subscription_action(request, subscription_id, subs_service.blacklist)


@api_view(["POST"])
def subscription_resubscribe(request, subscription_id: int):
    return _subscription_action(request, subscription_id, subs_service.resubscribe)


@api_view(["POST"])
def subscription_bulk(request):
    """POST /api/subscriptions/bulk/ - unsubscribe or blacklist many at once."""
    action = request.data.get("action")
    ids = request.data.get("subscription_ids") or []
    if action not in {"unsubscribe", "blacklist", "resubscribe"}:
        return Response({"detail": "action must be unsubscribe, blacklist or resubscribe"}, status=400)

    rows = list(Subscription.objects.filter(user=request.user, id__in=ids))
    for subscription in rows:
        if action == "unsubscribe":
            subs_service.unsubscribe(request.user, subscription)
        elif action == "blacklist":
            subs_service.blacklist(subscription)
        else:
            subs_service.resubscribe(subscription)
    return Response({"updated": len(rows), "action": action})


# ---------------------------------------------------------------- schedule


def _schedule_payload(user, day, block_minutes):
    plan = scheduler.build_plan(user, day=day, block_minutes=block_minutes)
    vips = _vip_emails(user)

    def item(message, slot):
        # The deadline is formatted here, in the same timezone the packer used.
        # Letting the browser format due_at would show a time that contradicts
        # the block it sits in whenever the two timezones differ.
        due_label = ""
        if message.due_at:
            due_label = timezone.localtime(message.due_at).strftime("%H:%M")
        return {
            "id": message.id,
            "thread_id": message.thread_id,
            "from_name": message.from_name,
            "from_email": message.from_email,
            "subject": message.subject,
            "effort_minutes": message.effort_minutes,
            "priority": message.priority,
            "is_vip": message.from_email in vips,
            "due_at": message.due_at,
            "due_label": due_label,
            "has_due": message.due_at is not None,
            "violates_deadline": bool(slot and scheduler.violates_deadline(message, slot, day)),
        }

    rows = []
    for slot in plan.slots:
        rows.append(
            {
                "type": "slot",
                "key": slot.key,
                "start": scheduler.hhmm(slot.start),
                "end": scheduler.hhmm(slot.end),
                "start_hour": slot.start,
                "capacity_minutes": slot.cap,
                "used_minutes": plan.used[slot.key],
                "over_capacity": plan.used[slot.key] > slot.cap,
                "items": [item(m, slot) for m in plan.by_slot[slot.key]],
            }
        )
    for meeting in plan.meetings:
        rows.append(
            {
                "type": "meeting",
                "title": meeting.title,
                "start": scheduler.hhmm(meeting.start),
                "end": scheduler.hhmm(meeting.end),
                "start_hour": meeting.start,
            }
        )
    rows.sort(key=lambda r: r["start_hour"])

    total_minutes = sum(
        m.effort_minutes for group in plan.by_slot.values() for m in group
    ) + sum(m.effort_minutes for m in plan.overflow)

    return {
        "date": day,
        "block_minutes": block_minutes or settings.SCHEDULE_DEFAULT_BLOCK_MINUTES,
        "rows": rows,
        "overflow": [item(m, None) for m in plan.overflow],
        "overflow_count": len(plan.overflow),
        "total_reply_minutes": total_minutes,
        "capacity_minutes": plan.total_capacity,
        "fits": total_minutes <= plan.total_capacity,
        "shortfall_minutes": max(0, total_minutes - plan.total_capacity),
    }


@api_view(["GET"])
def schedule(request):
    """GET /api/schedule/ - today's blocks with replies packed into them."""
    day = parse_date(request.GET.get("date", "")) or timezone.localdate()
    try:
        block_minutes = int(request.GET.get("block_minutes", settings.SCHEDULE_DEFAULT_BLOCK_MINUTES))
    except ValueError:
        return Response({"detail": "block_minutes must be an integer"}, status=400)
    if block_minutes not in (15, 30, 45):
        return Response({"detail": "block_minutes must be 15, 30 or 45"}, status=400)

    return Response(_schedule_payload(request.user, day, block_minutes))


@api_view(["POST"])
def schedule_assign(request):
    """POST /api/schedule/assign/ - pin messages to a block."""
    serializer = AssignSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    day = data.get("date") or timezone.localdate()

    valid_ids = set(
        MailMessage.objects.filter(
            user=request.user, id__in=data["message_ids"]
        ).values_list("id", flat=True)
    )
    for message_id in valid_ids:
        SlotAssignment.objects.update_or_create(
            user=request.user,
            message_id=message_id,
            date=day,
            defaults={"slot_key": data["slot_key"]},
        )
    return Response({"assigned": len(valid_ids), "slot_key": data["slot_key"]})


@api_view(["POST"])
def schedule_rebuild(request):
    """POST /api/schedule/rebuild/ - clears manual moves and repacks."""
    day = parse_date(str(request.data.get("date", ""))) or timezone.localdate()
    cleared, _ = SlotAssignment.objects.filter(user=request.user, date=day).delete()
    try:
        block_minutes = int(request.data.get("block_minutes", settings.SCHEDULE_DEFAULT_BLOCK_MINUTES))
    except (TypeError, ValueError):
        block_minutes = settings.SCHEDULE_DEFAULT_BLOCK_MINUTES

    payload = _schedule_payload(request.user, day, block_minutes)
    payload["cleared_assignments"] = cleared
    return Response(payload)
