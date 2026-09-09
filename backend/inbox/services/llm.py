"""Claude-backed triage: priority classification and VIP brief parsing.

Two calls, both using structured outputs so the response is guaranteed-valid
JSON rather than something we have to regex out of prose:

  classify_messages()            -- priority / needs_reply / category / effort
  parse_briefs_for_vip_threads() -- the Ask / Due / Why brief for VIP threads

Every path degrades to deterministic heuristics (`heuristic_classify`) when the
model is unavailable, disabled, or declines a request. That keeps sync working
without an API key and keeps the test suite offline.

Confidence rule from the handoff: a deadline is asserted as HIGH only when the
local date parser matched it. If only the model claims a deadline, the brief is
stored at LOW confidence with the sentence it read, and the UI refuses to state
a date.
"""
from __future__ import annotations

import json
import logging
import re

from django.conf import settings
from django.utils import timezone

from ..models import Confidence, MailMessage, MailThread, Priority, VipSender
from . import parsing

logger = logging.getLogger(__name__)

CATEGORIES = ["Clients", "Collabs", "Receipts", "Newsletters", "Social", "Personal", "Other"]
CLASSIFY_BATCH_SIZE = 10

# Flipped off permanently if the server rejects the fallback beta, so a single
# 400 does not turn into a failure on every subsequent request.
_fallbacks_enabled = True


class LLMUnavailable(RuntimeError):
    pass


def _client():
    if not settings.LLM_ENABLED:
        raise LLMUnavailable("LLM_ENABLED is false")
    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover
        raise LLMUnavailable("anthropic SDK not installed") from exc

    # An unset ANTHROPIC_API_KEY does not mean there are no credentials - the
    # SDK also resolves ANTHROPIC_AUTH_TOKEN and `ant auth login` profiles - so
    # construct the client and let it resolve, only passing a key when set.
    if settings.ANTHROPIC_API_KEY:
        return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    return anthropic.Anthropic()


def _request(*, system, messages, schema, effort, max_tokens):
    """One structured-output call. Returns parsed JSON, or raises LLMUnavailable."""
    global _fallbacks_enabled

    import anthropic

    client = _client()
    kwargs = dict(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
        output_config={
            "effort": effort,
            "format": {"type": "json_schema", "schema": schema},
        },
    )

    try:
        if _fallbacks_enabled:
            try:
                # Route around a safety decline instead of losing the batch.
                response = client.beta.messages.create(
                    betas=["server-side-fallback-2026-07-01"],
                    fallbacks="default",
                    **kwargs,
                )
            except anthropic.BadRequestError as exc:
                if "fallback" not in str(exc).lower():
                    raise
                logger.info("Server-side fallbacks unavailable; continuing without")
                _fallbacks_enabled = False
                response = client.messages.create(**kwargs)
        else:
            response = client.messages.create(**kwargs)
    except anthropic.NotFoundError as exc:
        raise LLMUnavailable(f"unknown model {settings.ANTHROPIC_MODEL}: {exc}") from exc
    except anthropic.AuthenticationError as exc:
        raise LLMUnavailable(f"authentication failed: {exc}") from exc
    except anthropic.RateLimitError as exc:
        raise LLMUnavailable(f"rate limited: {exc}") from exc
    except anthropic.APIStatusError as exc:
        raise LLMUnavailable(f"api error {exc.status_code}: {exc}") from exc
    except anthropic.APIConnectionError as exc:
        raise LLMUnavailable(f"connection error: {exc}") from exc

    if response.stop_reason == "refusal":
        category = getattr(response.stop_details, "category", None)
        raise LLMUnavailable(f"model declined the request ({category})")

    text = next((b.text for b in response.content if b.type == "text"), "")
    if not text:
        raise LLMUnavailable("empty response")
    return json.loads(text)


# ------------------------------------------------------------- heuristics

RECEIPT_WORDS = re.compile(
    r"\b(invoice|receipt|payout|payment|billing|renews?|renewal|subscription|order|refund)\b", re.I
)
QUESTION_WORDS = re.compile(
    r"\b(can you|could you|would you|are you|will you|let me know|thoughts|confirm|"
    r"sign|approve|review|available|when|what time|deadline|respond|reply|rsvp)\b", re.I
)
URGENT_WORDS = re.compile(
    r"\b(urgent|asap|today|overdue|immediately|final notice|last chance|by end of day|eod)\b", re.I
)
SOCIAL_DOMAINS = ("notion.so", "github.com", "slack.com", "linkedin.com", "x.com", "facebook.com")


def heuristic_classify(message: MailMessage, body: str = "", is_list_mail: bool = False) -> dict:
    """Deterministic fallback. Never calls out, always returns a full result."""
    haystack = f"{message.subject} {message.preview} {body[:1200]}"
    domain = (message.from_email or "").split("@")[-1]

    if is_list_mail and RECEIPT_WORDS.search(haystack):
        category = "Receipts"
    elif is_list_mail:
        category = "Newsletters"
    elif any(domain.endswith(d) for d in SOCIAL_DOMAINS):
        category = "Social"
    elif RECEIPT_WORDS.search(haystack):
        category = "Receipts"
    else:
        category = "Clients"

    needs_reply = (not is_list_mail) and bool(
        QUESTION_WORDS.search(haystack) or "?" in message.subject
    )

    deadline = parsing.extract_deadline(haystack)
    if deadline.matched or (needs_reply and URGENT_WORDS.search(haystack)):
        priority = Priority.URGENT
    elif needs_reply:
        priority = Priority.SOON
    else:
        priority = Priority.LATER

    words = len(body.split()) or len(message.preview.split())
    effort = 1 if not needs_reply else max(2, min(20, 2 + words // 60))

    return {
        "priority": int(priority),
        "needs_reply": needs_reply,
        "category": category,
        "effort_minutes": effort,
        "topics": "",
        "due_at": deadline.due_at,
    }


# ---------------------------------------------------------- classification

CLASSIFY_SYSTEM = """You triage a mailbox. For each message you receive the \
sender, subject and preview text.

Return one result per message, matched by id:

- priority: 0 urgent (a person is blocked, or a stated deadline is near), \
1 soon (a person expects a reply but nothing is blocked), 2 later (no reply \
needed - newsletters, receipts, notifications).
- needs_reply: true only when a human is waiting on a response from the \
mailbox owner. Automated mail, receipts and newsletters are false.
- category: one of Clients, Collabs, Receipts, Newsletters, Social, Personal, Other.
- effort_minutes: realistic minutes to write the reply, 1 to 30. Use 1 for \
anything that needs no reply.
- topics: up to six lowercase space-separated keywords for search (e.g. \
"money invoice billing overdue"). No punctuation.

Judge only from the text given. Do not invent deadlines."""

CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "priority": {"type": "integer", "enum": [0, 1, 2]},
                    "needs_reply": {"type": "boolean"},
                    "category": {"type": "string", "enum": CATEGORIES},
                    "effort_minutes": {"type": "integer"},
                    "topics": {"type": "string"},
                },
                "required": ["id", "priority", "needs_reply", "category", "effort_minutes", "topics"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["results"],
    "additionalProperties": False,
}


def _classify_batch(batch: list[MailMessage], bodies: dict[str, str]) -> dict[str, dict]:
    payload = [
        {
            "id": m.id,
            "from": f"{m.from_name} <{m.from_email}>",
            "subject": m.subject,
            "preview": (m.preview or bodies.get(m.id, ""))[:400],
        }
        for m in batch
    ]
    data = _request(
        system=CLASSIFY_SYSTEM,
        messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        schema=CLASSIFY_SCHEMA,
        effort="low",  # high-volume, low-ambiguity route
        max_tokens=4000,
    )
    return {row["id"]: row for row in data.get("results", []) if row.get("id")}


def classify_messages(user, messages: list[MailMessage], bodies: dict[str, str] | None = None) -> int:
    """Classifies messages in batches, writing results back. Returns the count."""
    bodies = bodies or {}
    if not messages:
        return 0

    updated = 0
    for start in range(0, len(messages), CLASSIFY_BATCH_SIZE):
        batch = messages[start : start + CLASSIFY_BATCH_SIZE]
        try:
            results = _classify_batch(batch, bodies)
        except (LLMUnavailable, json.JSONDecodeError, KeyError) as exc:
            logger.warning("Falling back to heuristics for %d messages: %s", len(batch), exc)
            results = {}

        for message in batch:
            body = bodies.get(message.id, "")
            row = results.get(message.id)
            if row is None:
                values = heuristic_classify(message, body)
            else:
                # The deadline still comes from the local parser, never the model.
                deadline = parsing.extract_deadline(f"{message.subject} {message.preview} {body[:1500]}")
                values = {
                    "priority": int(row["priority"]),
                    "needs_reply": bool(row["needs_reply"]),
                    "category": row["category"],
                    "effort_minutes": max(1, min(60, int(row["effort_minutes"]))),
                    "topics": (row.get("topics") or "")[:255],
                    "due_at": deadline.due_at,
                }

            message.priority = values["priority"]
            message.needs_reply = values["needs_reply"]
            message.category = values["category"]
            message.effort_minutes = values["effort_minutes"]
            message.topics = values["topics"]
            message.due_at = values["due_at"]
            message.classified_at = timezone.now()
            message.save(
                update_fields=[
                    "priority", "needs_reply", "category", "effort_minutes",
                    "topics", "due_at", "classified_at",
                ]
            )
            updated += 1
    return updated


# ------------------------------------------------------------- VIP briefs

BRIEF_SYSTEM = """You read one email thread and summarise what the recipient \
must actually do.

Return:
- ask: the single concrete action required, max 10 words, imperative \
(e.g. "Sign section 4 of the redline").
- why: one short clause on why it matters, max 12 words.
- deadline_sentence: copy the exact sentence from the message that states a \
deadline. If no sentence states one, return an empty string. Never paraphrase \
and never invent a sentence.
- deadline_claimed: true only if deadline_sentence is non-empty.

Be literal. If the message states no action, use ask "Read and decide"."""

BRIEF_SCHEMA = {
    "type": "object",
    "properties": {
        "ask": {"type": "string"},
        "why": {"type": "string"},
        "deadline_sentence": {"type": "string"},
        "deadline_claimed": {"type": "boolean"},
    },
    "required": ["ask", "why", "deadline_sentence", "deadline_claimed"],
    "additionalProperties": False,
}


def _heuristic_brief(message: MailMessage, deadline: parsing.Deadline) -> dict:
    subject = (message.subject or "").strip()
    return {
        "ask": (f"Reply to {message.from_name or message.from_email}" if not subject else subject)[:255],
        "why": "On your important list",
        "deadline_sentence": deadline.evidence,
        "deadline_claimed": deadline.matched,
    }


def parse_brief(message: MailMessage, body: str = "") -> dict:
    """Builds the Ask/Due/Why brief for one message.

    The local parser owns the deadline. The model only supplies the ask, the
    why, and the sentence it believes states a deadline.
    """
    haystack = f"{message.subject}\n{message.preview}\n{body[:3000]}"
    deadline = parsing.extract_deadline(haystack)

    try:
        data = _request(
            system=BRIEF_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"From: {message.from_name} <{message.from_email}>\n"
                        f"Subject: {message.subject}\n\n{body[:3000] or message.preview}"
                    ),
                }
            ],
            schema=BRIEF_SCHEMA,
            effort="medium",  # deadline judgement deserves more care than triage
            max_tokens=1000,
        )
    except (LLMUnavailable, json.JSONDecodeError, KeyError) as exc:
        logger.info("VIP brief falling back to heuristics: %s", exc)
        data = _heuristic_brief(message, deadline)

    if deadline.matched:
        # A real date parser matched: assert it.
        confidence = Confidence.HIGH
        due_at, due_text = deadline.due_at, deadline.text
        evidence = deadline.evidence
    else:
        # Only the model thinks there is a deadline (or nobody does). Refuse to
        # state a date; show what was read instead.
        confidence = Confidence.LOW
        due_at, due_text = None, "Mentions a deadline - not confirmed"
        evidence = (data.get("deadline_sentence") or "").strip()
        if not data.get("deadline_claimed") or not evidence:
            due_text = "No deadline stated"
            evidence = evidence or (message.preview or "")[:300]

    return {
        "brief_ask": (data.get("ask") or "")[:255],
        "brief_why": (data.get("why") or "On your important list")[:255],
        "brief_due_at": due_at,
        "brief_due_text": due_text[:120],
        "brief_evidence": evidence[:1000],
        "brief_confidence": confidence,
        "brief_parsed_at": timezone.now(),
    }


def parse_briefs_for_vip_threads(user, bodies: dict[str, str] | None = None, limit: int = 5) -> int:
    """Parses briefs for the newest open threads from VIP senders."""
    bodies = bodies or {}
    vip_emails = list(VipSender.objects.filter(user=user).values_list("email", flat=True))
    if not vip_emails:
        return 0

    candidates = (
        MailMessage.objects.filter(
            user=user, from_email__in=vip_emails, is_archived=False
        )
        .select_related("thread")
        .order_by("priority", "-timestamp")
    )

    seen_threads: set[str] = set()
    parsed = 0
    for message in candidates:
        if message.thread_id in seen_threads:
            continue
        seen_threads.add(message.thread_id)
        if parsed >= limit:
            break
        thread = message.thread
        if thread.brief_parsed_at and thread.brief_parsed_at >= message.timestamp:
            continue  # already summarised at this thread's current state

        values = parse_brief(message, bodies.get(message.id, ""))
        MailThread.objects.filter(pk=thread.pk).update(**values)
        parsed += 1
    return parsed
