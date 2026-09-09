"""Gmail and Google Calendar sync.

`sync_inbox` is the entry point: it pulls the latest N inbox messages, upserts
them, refreshes subscription analytics, and hands anything new to the LLM
classifier. It is safe to re-run - every write is an upsert keyed on the Gmail
message id, and already-classified messages are not re-sent to the model.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date as date_cls

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from accounts.oauth import credentials_for
from accounts.models import GoogleCredential

from ..models import CalendarSlot, MailMessage, MailThread
from . import parsing

logger = logging.getLogger(__name__)

METADATA_HEADERS = [
    "From", "To", "Cc", "Subject", "Date",
    "List-Unsubscribe", "List-Id", "Precedence", "X-Campaign-Id",
]


@dataclass
class SyncResult:
    fetched: int = 0
    created: int = 0
    updated: int = 0
    classified: int = 0
    briefs: int = 0
    errors: list[str] = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = []

    def as_dict(self) -> dict:
        return {
            "fetched": self.fetched,
            "created": self.created,
            "updated": self.updated,
            "classified": self.classified,
            "briefs": self.briefs,
            "errors": self.errors,
        }


def gmail_service(user):
    return build("gmail", "v1", credentials=credentials_for(user), cache_discovery=False)


def calendar_service(user):
    return build("calendar", "v3", credentials=credentials_for(user), cache_discovery=False)


# ------------------------------------------------------------------ fetching


def _fetch_message_ids(service, max_results: int, query: str = "") -> list[str]:
    """Lists inbox message ids, paging until max_results is satisfied."""
    ids: list[str] = []
    page_token = None
    while len(ids) < max_results:
        response = (
            service.users()
            .messages()
            .list(
                userId="me",
                labelIds=["INBOX"],
                maxResults=min(100, max_results - len(ids)),
                q=query or None,
                pageToken=page_token,
            )
            .execute()
        )
        ids.extend(m["id"] for m in response.get("messages", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return ids[:max_results]


def _fetch_messages(service, ids: list[str]) -> list[dict]:
    """Fetches full messages, using one batch request where possible.

    Falls back to sequential gets if the batch endpoint refuses - some Workspace
    configurations reject it, and a slow sync beats a failed one.
    """
    if not ids:
        return []

    collected: list[dict] = []
    failed: list[str] = []

    def handle(request_id, response, exception):
        if exception is not None:
            failed.append(request_id)
            return
        collected.append(response)

    try:
        # Gmail caps a batch at 100 sub-requests.
        for chunk_start in range(0, len(ids), 100):
            chunk = ids[chunk_start : chunk_start + 100]
            batch = service.new_batch_http_request(callback=handle)
            for message_id in chunk:
                batch.add(
                    service.users().messages().get(userId="me", id=message_id, format="full"),
                    request_id=message_id,
                )
            batch.execute()
    except (HttpError, OSError, ValueError) as exc:
        logger.warning("Gmail batch fetch failed (%s); falling back to sequential", exc)
        collected, failed = [], list(ids)

    for message_id in failed:
        try:
            collected.append(
                service.users().messages().get(userId="me", id=message_id, format="full").execute()
            )
        except HttpError as exc:
            logger.warning("Skipping message %s: %s", message_id, exc)

    return collected


def parse_message(raw: dict) -> dict:
    """Turns a Gmail message resource into MailMessage field values."""
    payload = raw.get("payload") or {}
    headers = parsing.header_map(payload)
    from_name, from_email = parsing.split_address(headers.get("from", ""))
    body = parsing.extract_body_text(payload)
    label_ids = raw.get("labelIds") or []

    return {
        "id": raw["id"],
        "thread_id": raw.get("threadId") or raw["id"],
        "from_email": from_email,
        "from_name": from_name,
        "to": parsing.split_address_list(headers.get("to", "")),
        "subject": (headers.get("subject") or "")[:998],
        "preview": parsing.make_preview(raw.get("snippet", ""), body),
        "timestamp": parsing.parse_date(headers.get("date", ""), raw.get("internalDate")),
        "is_unread": "UNREAD" in label_ids,
        "is_archived": "INBOX" not in label_ids,
        "has_attachment": parsing.has_attachment(payload),
        "body": body,
        "headers": headers,
        "is_list_mail": parsing.looks_like_list_mail(headers),
        "list_unsubscribe": headers.get("list-unsubscribe", "")[:1024],
    }


# ------------------------------------------------------------------- syncing


@transaction.atomic
def _upsert(user, parsed: dict) -> tuple[MailMessage, bool]:
    thread, _ = MailThread.objects.update_or_create(
        id=parsed["thread_id"],
        user=user,
        defaults={
            "subject": parsed["subject"],
            "latest_timestamp": parsed["timestamp"],
            "is_open": parsed["is_unread"] or not parsed["is_archived"],
        },
    )
    message, created = MailMessage.objects.update_or_create(
        id=parsed["id"],
        user=user,
        defaults={
            "thread": thread,
            "from_email": parsed["from_email"],
            "from_name": parsed["from_name"],
            "to": parsed["to"],
            "subject": parsed["subject"],
            "preview": parsed["preview"],
            "timestamp": parsed["timestamp"],
            "is_unread": parsed["is_unread"],
            "is_archived": parsed["is_archived"],
            "has_attachment": parsed["has_attachment"],
        },
    )
    return message, created


def sync_inbox(user, max_results: int | None = None, classify: bool = True) -> SyncResult:
    """Pulls the latest inbox messages and enriches them."""
    from .llm import classify_messages, parse_briefs_for_vip_threads
    from .subscriptions import rebuild_subscriptions

    max_results = max_results or settings.GMAIL_SYNC_MAX_RESULTS
    result = SyncResult()

    service = gmail_service(user)
    ids = _fetch_message_ids(service, max_results)
    raw_messages = _fetch_messages(service, ids)
    result.fetched = len(raw_messages)

    parsed_by_id: dict[str, dict] = {}
    fresh: list[MailMessage] = []
    for raw in raw_messages:
        try:
            parsed = parse_message(raw)
        except (KeyError, ValueError) as exc:
            result.errors.append(f"parse {raw.get('id')}: {exc}")
            continue
        parsed_by_id[parsed["id"]] = parsed
        message, created = _upsert(user, parsed)
        result.created += int(created)
        result.updated += int(not created)
        if created or not message.is_classified:
            fresh.append(message)

    rebuild_subscriptions(user, parsed_by_id.values())

    if classify and fresh:
        bodies = {mid: p["body"] for mid, p in parsed_by_id.items()}
        result.classified = classify_messages(user, fresh, bodies)
        result.briefs = parse_briefs_for_vip_threads(user, bodies)

    GoogleCredential.objects.filter(user=user).update(last_synced_at=timezone.now())
    return result


def archive_thread(user, thread_id: str) -> bool:
    """Removes the INBOX label from every message in a thread."""
    service = gmail_service(user)
    try:
        service.users().threads().modify(
            userId="me", id=thread_id, body={"removeLabelIds": ["INBOX"]}
        ).execute()
    except HttpError as exc:
        logger.warning("Archive failed for thread %s: %s", thread_id, exc)
        return False
    MailMessage.objects.filter(user=user, thread_id=thread_id).update(is_archived=True)
    MailThread.objects.filter(user=user, id=thread_id).update(is_open=False)
    return True


def trash_messages(user, message_ids: list[str]) -> int:
    """Moves messages to Gmail's trash (recoverable for 30 days)."""
    if not message_ids:
        return 0
    service = gmail_service(user)
    moved = 0
    for message_id in message_ids:
        try:
            service.users().messages().trash(userId="me", id=message_id).execute()
            moved += 1
        except HttpError as exc:
            logger.warning("Trash failed for %s: %s", message_id, exc)
    MailMessage.objects.filter(user=user, id__in=message_ids).delete()
    return moved


# ------------------------------------------------------------------ calendar


def sync_calendar(user, day: date_cls | None = None) -> int:
    """Replaces today's busy blocks with what Google Calendar reports."""
    day = day or timezone.localdate()
    service = calendar_service(user)

    tz = timezone.get_current_timezone()
    start = timezone.make_aware(
        timezone.datetime.combine(day, timezone.datetime.min.time()), tz
    )
    end = start + timezone.timedelta(days=1)

    events = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=start.isoformat(),
            timeMax=end.isoformat(),
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    ).get("items", [])

    CalendarSlot.objects.filter(user=user, date=day).delete()
    rows = []
    for event in events:
        start_raw = (event.get("start") or {}).get("dateTime")
        end_raw = (event.get("end") or {}).get("dateTime")
        if not start_raw or not end_raw:
            continue  # all-day events do not carve up a working day
        if event.get("transparency") == "transparent":
            continue  # marked "free" by the organiser
        start_dt = timezone.localtime(timezone.datetime.fromisoformat(start_raw))
        end_dt = timezone.localtime(timezone.datetime.fromisoformat(end_raw))
        rows.append(
            CalendarSlot(
                user=user,
                external_id=event.get("id", "")[:255],
                date=day,
                start_time=start_dt.time(),
                end_time=end_dt.time(),
                title=(event.get("summary") or "Busy")[:255],
                is_busy=True,
            )
        )
    CalendarSlot.objects.bulk_create(rows)
    return len(rows)
