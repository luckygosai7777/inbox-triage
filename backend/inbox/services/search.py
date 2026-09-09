"""Search ranking for the mail list.

Every token must hit some field (AND semantics), so "priya invoice" narrows
instead of widening. Field weights decide ordering: address and sender beat
subject, which beats topic keywords. Word-start matches rank above mid-word
ones, so "ray" does not outrank "Raman" on a search for "ram".
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..models import MailMessage, Priority

# (attribute, weight)
FIELD_WEIGHTS = (
    ("from_name", 10),
    ("from_email", 10),
    ("subject", 6),
    ("category", 4),
    ("preview", 3),
    ("topics", 2),
)


@dataclass
class Hit:
    message: MailMessage
    score: int
    matched_person: bool  # the hit was on a sender or address, so show the address


def tokenize(query: str) -> list[str]:
    return [t for t in re.split(r"\s+", (query or "").strip().lower()) if t]


def _boundary_match(text: str, token: str) -> bool:
    return re.search(r"(^|[^a-z0-9])" + re.escape(token), text) is not None


def score_message(message: MailMessage, tokens: list[str]) -> Hit | None:
    """Returns None when any token fails to match, which drops the message."""
    fields = [(str(getattr(message, attr, "") or "").lower(), weight) for attr, weight in FIELD_WEIGHTS]
    fields.append((Priority(message.priority).label.lower(), 2))

    person_fields = {
        str(message.from_name or "").lower(),
        str(message.from_email or "").lower(),
    }

    total = 0
    matched_person = False
    for token in tokens:
        best, best_text = 0, None
        for text, weight in fields:
            if token not in text:
                continue
            value = weight * (2 if _boundary_match(text, token) else 1)
            if value > best:
                best, best_text = value, text
        if not best:
            return None
        total += best
        if best_text in person_fields:
            matched_person = True

    return Hit(message=message, score=total, matched_person=matched_person)


def search(messages, query: str) -> list[Hit]:
    """Ranked hits, best first. An empty query returns everything unranked."""
    tokens = tokenize(query)
    if not tokens:
        return [Hit(message=m, score=0, matched_person=False) for m in messages]

    hits = [h for h in (score_message(m, tokens) for m in messages) if h is not None]
    hits.sort(key=lambda h: (-h.score, h.message.priority, -h.message.timestamp.timestamp()))
    return hits
