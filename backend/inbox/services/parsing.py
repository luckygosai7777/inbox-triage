"""Pure parsing helpers for Gmail payloads. No network, no ORM - unit testable.

The deadline extractor here is deliberately conservative. The handoff asks for
confidence HIGH only when a real date/time parser matches, and for the UI to
refuse to assert a deadline otherwise; anything this module cannot pin down is
left to the LLM and reported as LOW confidence.
"""
from __future__ import annotations

import base64
import re
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from email.utils import parseaddr, parsedate_to_datetime

from django.utils import timezone

# ---------------------------------------------------------------- headers


def header_map(payload: dict) -> dict[str, str]:
    """Lowercased header name -> value."""
    headers = (payload or {}).get("headers") or []
    return {h.get("name", "").lower(): h.get("value", "") for h in headers}


def split_address(raw: str) -> tuple[str, str]:
    """"Maya Okonkwo <maya@x.co>" -> ("Maya Okonkwo", "maya@x.co")."""
    name, email = parseaddr(raw or "")
    email = (email or "").strip().lower()
    name = (name or "").strip().strip('"')
    if not name and email:
        name = email.split("@")[0].replace(".", " ").title()
    return name, email


def split_address_list(raw: str) -> list[str]:
    if not raw:
        return []
    out = []
    for chunk in raw.split(","):
        _, email = split_address(chunk)
        if email:
            out.append(email)
    return out


def parse_date(raw: str, fallback_ms: str | int | None = None) -> datetime:
    """Prefers the Date: header, falls back to Gmail's internalDate (epoch ms)."""
    if raw:
        try:
            parsed = parsedate_to_datetime(raw)
            if parsed is not None:
                if timezone.is_naive(parsed):
                    parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
                return parsed
        except (TypeError, ValueError):
            pass
    if fallback_ms is not None:
        try:
            return datetime.fromtimestamp(int(fallback_ms) / 1000, tz=timezone.utc)
        except (TypeError, ValueError, OSError):
            pass
    return timezone.now()


# ------------------------------------------------------------------ bodies


def _decode(data: str) -> str:
    if not data:
        return ""
    padding = "=" * (-len(data) % 4)
    try:
        return base64.urlsafe_b64decode(data + padding).decode("utf-8", errors="replace")
    except (ValueError, TypeError):
        return ""


def walk_parts(payload: dict):
    """Yields every MIME part depth-first, including the root."""
    if not payload:
        return
    stack = [payload]
    while stack:
        part = stack.pop()
        yield part
        stack.extend(reversed(part.get("parts") or []))


def extract_body_text(payload: dict, limit: int = 4000) -> str:
    """Best-effort plain text. Prefers text/plain, falls back to stripped HTML."""
    plain, html = "", ""
    for part in walk_parts(payload):
        mime = part.get("mimeType", "")
        data = (part.get("body") or {}).get("data")
        if not data:
            continue
        if mime == "text/plain" and not plain:
            plain = _decode(data)
        elif mime == "text/html" and not html:
            html = _decode(data)
    text = plain or re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:limit]


def has_attachment(payload: dict) -> bool:
    return any(
        part.get("filename") and (part.get("body") or {}).get("attachmentId")
        for part in walk_parts(payload)
    )


def make_preview(snippet: str, body: str, limit: int = 220) -> str:
    text = (snippet or "").strip() or " ".join((body or "").split())
    text = " ".join(text.split())
    return text[:limit]


# -------------------------------------------------------------- deadlines

WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}

_TIME = r"(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<ampm>am|pm)?"

# Ordered most-specific first; the first match wins.
DEADLINE_PATTERNS: list[tuple[str, str]] = [
    ("today_at", rf"\bby\s+{_TIME}\s+today\b"),
    ("today_at", rf"\btoday\b[^.\n]{{0,20}}?\bby\s+{_TIME}"),
    ("today_at", rf"\bbefore\s+{_TIME}\s+today\b"),
    ("weekday", r"\bby\s+(?P<weekday>monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b"),
    ("weekday", r"\bneed\s+(?:an\s+)?answer\s+by\s+(?P<weekday>monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b"),
    ("tomorrow", r"\bby\s+tomorrow\b"),
    ("today", r"\b(?:by\s+)?end\s+of\s+(?:the\s+)?day\b|\beod\b"),
    ("today", r"\bby\s+today\b|\btoday\b[^.\n]{0,24}\bdeadline\b"),
]


@dataclass
class Deadline:
    """A deadline read out of message text.

    `due_at` is populated only when a pattern matched, which is what earns
    HIGH confidence. `evidence` is the sentence it came from.
    """

    due_at: datetime | None = None
    text: str = ""
    evidence: str = ""
    confidence: str = "low"
    matched: bool = field(default=False)


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", text or "")
    return [p.strip() for p in parts if p.strip()]


def _resolve_hour(match: re.Match) -> int | None:
    raw_hour = match.groupdict().get("hour")
    if raw_hour is None:
        return None
    hour = int(raw_hour)
    ampm = (match.groupdict().get("ampm") or "").lower()
    if ampm == "pm" and hour < 12:
        hour += 12
    elif ampm == "am" and hour == 12:
        hour = 0
    return hour if 0 <= hour <= 23 else None


def extract_deadline(text: str, now: datetime | None = None) -> Deadline:
    """Finds an explicit deadline. Returns matched=False when none is stated."""
    now = now or timezone.localtime()
    for sentence in sentences(text):
        low = sentence.lower()
        for kind, pattern in DEADLINE_PATTERNS:
            match = re.search(pattern, low)
            if not match:
                continue

            groups = match.groupdict()
            if kind == "today_at":
                hour = _resolve_hour(match)
                if hour is None:
                    continue
                minute = int(groups.get("minute") or 0)
                due = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                label = f"Today, {due:%H:%M}"
            elif kind == "today":
                due = now.replace(hour=18, minute=0, second=0, microsecond=0)
                label = "Today, 18:00"
            elif kind == "tomorrow":
                due = (now + timedelta(days=1)).replace(
                    hour=18, minute=0, second=0, microsecond=0
                )
                label = "Tomorrow, 18:00"
            elif kind == "weekday":
                target = WEEKDAYS[groups["weekday"]]
                ahead = (target - now.weekday()) % 7 or 7
                due = (now + timedelta(days=ahead)).replace(
                    hour=18, minute=0, second=0, microsecond=0
                )
                label = f"{groups['weekday'].capitalize()}, 18:00"
            else:  # pragma: no cover - table above is exhaustive
                continue

            return Deadline(
                due_at=due,
                text=label,
                evidence=sentence[:300],
                confidence="high",
                matched=True,
            )
    return Deadline(confidence="low", matched=False)


# --------------------------------------------------- List-Unsubscribe header

MAILTO_RE = re.compile(r"<mailto:([^>?]+)", re.I)
HTTP_RE = re.compile(r"<(https?://[^>]+)>", re.I)


def parse_list_unsubscribe(raw: str) -> dict[str, str]:
    """Splits a List-Unsubscribe header into its mailto: and https: targets."""
    out: dict[str, str] = {}
    if not raw:
        return out
    mailto = MAILTO_RE.search(raw)
    if mailto:
        out["mailto"] = mailto.group(1).strip()
    http = HTTP_RE.search(raw)
    if http:
        out["url"] = http.group(1).strip()
    return out


def looks_like_list_mail(headers: dict[str, str]) -> bool:
    """True when the sender is mailing a list rather than writing to a person."""
    markers = ("list-unsubscribe", "list-id", "precedence", "x-campaign-id")
    if any(m in headers for m in markers):
        return True
    return headers.get("precedence", "").lower() in {"bulk", "list", "junk"}


def to_local_time(value: datetime) -> time:
    return timezone.localtime(value).time()
