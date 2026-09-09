"""Subscription analytics and unsubscribe actions.

Engagement is measured, not guessed: opens come from Gmail read status,
dismissals from mail that was archived or trashed while still unread, and
clicks are only counted when the user marks one. A sender is dormant when it
cleared neither bar inside the chosen window.
"""
from __future__ import annotations

import logging
import re
import smtplib
from collections import defaultdict
from datetime import timedelta
from email.message import EmailMessage

from django.conf import settings
from django.db.models import Count, Max, Q
from django.utils import timezone

from ..models import MailMessage, Subscription, SubscriptionStatus
from . import parsing

logger = logging.getLogger(__name__)

WINDOWS = (30, 90, 180)


def rebuild_subscriptions(user, parsed_messages) -> int:
    """Upserts a Subscription row per list sender seen in this sync.

    `parsed_messages` are the dicts from gmail.parse_message, which carry the
    List-Unsubscribe header that the stored MailMessage does not.
    """
    by_sender: dict[str, list[dict]] = defaultdict(list)
    for parsed in parsed_messages:
        if not parsed.get("is_list_mail") or not parsed.get("from_email"):
            continue
        by_sender[parsed["from_email"]].append(parsed)

    touched = 0
    for sender_email, group in by_sender.items():
        newest = max(group, key=lambda p: p["timestamp"])
        subscription, _ = Subscription.objects.get_or_create(
            user=user,
            sender_email=sender_email,
            defaults={"sender_name": newest.get("from_name") or sender_email},
        )
        if newest.get("list_unsubscribe"):
            subscription.list_unsubscribe = newest["list_unsubscribe"]
        if not subscription.sender_name:
            subscription.sender_name = newest.get("from_name") or sender_email

        _refresh_counters(user, subscription)
        touched += 1
    return touched


def _refresh_counters(user, subscription: Subscription) -> Subscription:
    """Recomputes window stats for one sender from stored mail."""
    now = timezone.now()
    stats: dict[str, list[int]] = {}

    for window in WINDOWS:
        since = now - timedelta(days=window)
        rows = MailMessage.objects.filter(
            user=user, from_email=subscription.sender_email, timestamp__gte=since
        ).aggregate(
            total=Count("id"),
            opened=Count("id", filter=Q(is_unread=False)),
            dismissed=Count("id", filter=Q(is_unread=True, is_archived=True)),
        )
        # Clicks are not observable from the Gmail API; the count only rises
        # when the user explicitly marks one, so it is preserved, not recomputed.
        _, existing_clicks, _ = subscription.stats_for(window)
        stats[str(window)] = [rows["opened"] or 0, existing_clicks, rows["dismissed"] or 0]

    lifetime = MailMessage.objects.filter(
        user=user, from_email=subscription.sender_email
    ).aggregate(
        total=Count("id"),
        opened=Count("id", filter=Q(is_unread=False)),
        dismissed=Count("id", filter=Q(is_unread=True, is_archived=True)),
        latest=Max("timestamp"),
    )

    ninety_day_total = MailMessage.objects.filter(
        user=user,
        from_email=subscription.sender_email,
        timestamp__gte=now - timedelta(days=90),
    ).count()

    subscription.window_stats = stats
    subscription.opens_count = lifetime["opened"] or 0
    subscription.dismissals_count = lifetime["dismissed"] or 0
    subscription.messages_per_month = int(round(ninety_day_total / 3))
    subscription.last_activity_at = lifetime["latest"]
    subscription.save()
    return subscription


def refresh_all(user) -> int:
    for subscription in Subscription.objects.filter(user=user):
        _refresh_counters(user, subscription)
    return Subscription.objects.filter(user=user).count()


def dormant(user, window_days: int | None = None) -> list[Subscription]:
    window_days = window_days or settings.DORMANT_WINDOW_DAYS
    return [
        s
        for s in Subscription.objects.filter(user=user, status=SubscriptionStatus.ACTIVE)
        if s.is_dormant(window_days)
    ]


# ------------------------------------------------------------- actions

def unsubscribe(user, subscription: Subscription) -> dict:
    """Acts on the List-Unsubscribe header.

    A mailto: target is sent from the user's own account; an https: target is
    handed back for the browser to open, because many one-click endpoints
    require a real user agent and some treat a server-side GET as a no-op.
    """
    targets = parsing.parse_list_unsubscribe(subscription.list_unsubscribe)
    result = {"method": None, "url": None, "sent": False}

    if targets.get("mailto"):
        result["method"] = "mailto"
        result["sent"] = _send_unsubscribe_mail(user, targets["mailto"])
    if targets.get("url"):
        result.setdefault("method", "url")
        result["method"] = result["method"] or "url"
        result["url"] = targets["url"]

    subscription.status = SubscriptionStatus.UNSUBSCRIBED
    subscription.save(update_fields=["status"])
    return result


def _send_unsubscribe_mail(user, address: str) -> bool:
    """Best-effort unsubscribe email. Opt-in, and never fatal.

    Gated on an explicit setting rather than EMAIL_HOST, which Django defaults
    to "localhost" - relying on that truthiness would fire a real SMTP
    connection attempt on every unsubscribe in an unconfigured deployment.
    """
    if not getattr(settings, "UNSUBSCRIBE_EMAIL_ENABLED", False):
        logger.info("Unsubscribe mail disabled; skipping mailto: for %s", address)
        return False
    try:
        message = EmailMessage()
        message["To"] = address
        message["From"] = user.email
        message["Subject"] = "unsubscribe"
        message.set_content("unsubscribe")
        with smtplib.SMTP(settings.EMAIL_HOST, getattr(settings, "EMAIL_PORT", 587)) as smtp:
            smtp.send_message(message)
        return True
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("Unsubscribe mail to %s failed: %s", address, exc)
        return False


def blacklist(subscription: Subscription) -> Subscription:
    """Local mute. Held, not deleted, so it can be reversed."""
    subscription.status = SubscriptionStatus.MUTED
    subscription.muted_at = timezone.now()
    subscription.save(update_fields=["status", "muted_at"])
    return subscription


def resubscribe(subscription: Subscription) -> Subscription:
    subscription.status = SubscriptionStatus.ACTIVE
    subscription.muted_at = None
    subscription.save(update_fields=["status", "muted_at"])
    return subscription


def mark_click(subscription: Subscription, window_days: int = 90) -> Subscription:
    """Records a user-reported click, which lifts the sender out of dormancy."""
    stats = dict(subscription.window_stats or {})
    for window in WINDOWS:
        if window >= window_days:
            opens, clicks, dismissed = subscription.stats_for(window)
            stats[str(window)] = [opens, clicks + 1, dismissed]
    subscription.window_stats = stats
    subscription.clicks_count += 1
    subscription.save(update_fields=["window_stats", "clicks_count"])
    return subscription
