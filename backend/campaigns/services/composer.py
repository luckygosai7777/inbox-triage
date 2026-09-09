"""Per-recipient message rendering for bulk send.

`compose` returns marked-up parts rather than a flat string so the preview can
show exactly which words the model wrote. Each part carries `ai: true` when the
model authored it (as opposed to merely filling a CSV value in), which is what
the UI paints orange.

Grounded openers quote the source material the user pasted, so they can only
say things the user supplied. Ungrounded openers come from a generic bank and
are labelled as such in the UI.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlencode

USE_CASES: dict[str, dict[str, str]] = {
    "Job application": {
        "subject": "[role] - Jordan Diaz",
        "body": (
            "Hi [first],\n\n[ai_opener]\n\nI'm applying for the [role] role at [org]. "
            "I've spent six years on product teams shipping design systems and "
            "end-to-end flows, most recently taking a payments redesign from research "
            "through launch.\n\nMy resume is attached. Happy to walk through anything "
            "in more detail if it's useful.\n\n[ai_signoff]\nJordan Diaz"
        ),
    },
    "Recruiter outreach": {
        "subject": "[role] role - would you be open to a chat?",
        "body": (
            "Hi [first],\n\n[ai_opener]\n\nI'm hiring a [role] and your work at [org] "
            "is exactly the profile we keep coming back to. The team is six people, "
            "remote-first, and the role owns its surface end to end.\n\nI've attached "
            "the role brief. Even if now isn't the moment, I'd value knowing what "
            "would make it interesting.\n\n[ai_signoff]\nJordan Diaz"
        ),
    },
    "Sales intro": {
        "subject": "Cutting [org]'s inbox load",
        "body": (
            "Hi [first],\n\n[ai_opener]\n\nTeams like [org] usually lose an hour a day "
            "to triage. We cut that by sorting mail by reply priority and clearing "
            "dead subscriptions automatically - most teams see it inside a week.\n\n"
            "One-pager attached. Worth fifteen minutes?\n\n[ai_signoff]\nJordan Diaz"
        ),
    },
    "Custom": {
        "subject": "Quick note for [first]",
        "body": (
            "Hi [first],\n\n[ai_opener]\n\nWrite your message here. Use the tokens "
            "above for anything that changes per recipient - [name], [org], [role].\n\n"
            "[ai_signoff]\nJordan Diaz"
        ),
    },
}

OPENERS = {
    "systems": "The design systems work at [org] is the kind of infrastructure most teams skip, and it shows in your product.",
    "brand": "[org]'s brand work has a point of view, which is harder to pull off than it looks.",
    "manage": "I noticed you're building out the design org at [org] - that's usually where the interesting problems are.",
    "design": "I've been following the design work coming out of [org] - the craft in your recent product surfaces stands out.",
    "product": "I've been watching how [org] ships product, and the pace without loss of polish is rare.",
    "fallback": "I came across [org] recently and the way your team works stuck with me.",
}

SIGNOFFS = {"Formal": "Kind regards,", "Warm": "Thanks so much,", "Direct": "Best,"}

TOKEN_RE = re.compile(r"(\[[a-z_]+\])")
GMAIL_COMPOSE = "https://mail.google.com/mail/"


@dataclass
class Part:
    text: str
    ai: bool

    def as_dict(self) -> dict:
        return {"text": self.text, "ai": self.ai}


def opener_for(recipient, grounding: str = "") -> str:
    """Grounded openers quote the user's source; ungrounded ones are generic."""
    source = (grounding or "").strip()
    if source:
        clause = re.split(r"[.\n]", source)[0].strip()
        clause = re.sub(r"^(i|we)\s+", "", clause, flags=re.I).strip()
        if clause:
            clause = clause[0].lower() + clause[1:]
            return f"You mentioned {clause} - that's what prompted me to write."

    role = (getattr(recipient, "role", "") or "").lower()
    if "system" in role:
        key = "systems"
    elif "brand" in role:
        key = "brand"
    elif any(word in role for word in ("manager", "head", "lead")):
        key = "manage"
    elif "design" in role:
        key = "design"
    elif "product" in role:
        key = "product"
    else:
        key = "fallback"
    return OPENERS[key].replace("[org]", getattr(recipient, "org", "") or "your team")


def compose(text: str, recipient, campaign) -> list[dict]:
    """Renders a template into paragraphs of marked parts."""
    tokens_only = campaign.intensity == "Tokens only"
    org = recipient.org or "your team"
    values = {
        "[first]": recipient.first_name,
        "[name]": recipient.name,
        "[org]": org,
        "[role]": recipient.role or "there",
        "[ai_opener]": (
            "Hope this finds you well."
            if tokens_only
            else opener_for(recipient, campaign.grounding)
        ),
        "[ai_signoff]": SIGNOFFS.get(campaign.tone, SIGNOFFS["Formal"]),
    }
    # Tokens the model authored, as opposed to values copied from the CSV.
    authored = {
        "[ai_opener]": not tokens_only,
        "[ai_signoff]": campaign.tone != "Formal",
    }

    paragraphs = []
    for paragraph in (text or "").split("\n\n"):
        parts: list[Part] = []
        for chunk in TOKEN_RE.split(paragraph):
            if not chunk:
                continue
            if chunk in values:
                parts.append(Part(values[chunk], authored.get(chunk, False)))
            else:
                parts.append(Part(chunk, False))
        paragraphs.append({"parts": [p.as_dict() for p in parts]})
    return paragraphs


def compose_line(text: str, recipient, campaign) -> list[dict]:
    """Single-line render (subjects)."""
    rendered = compose(text, recipient, campaign)
    return rendered[0]["parts"] if rendered else []


def flatten(paragraphs: list[dict]) -> str:
    return "\n\n".join(
        "".join(part["text"] for part in paragraph["parts"]) for paragraph in paragraphs
    )


def documents_for(campaign, recipient) -> list:
    return [d for d in campaign.documents.all() if d.applies_to(recipient.role)]


def gmail_compose_url(recipient, subject: str, body: str) -> str:
    """Gmail deep link. It cannot carry attachments - the UI says so."""
    query = urlencode(
        {"view": "cm", "fs": "1", "to": recipient.email, "su": subject, "body": body}
    )
    return f"{GMAIL_COMPOSE}?{query}"


def render_for(campaign, recipient) -> dict:
    """Everything the preview and the send step need for one recipient."""
    subject_parts = compose_line(campaign.subject_template, recipient, campaign)
    body_paragraphs = compose(campaign.body_template, recipient, campaign)
    subject = "".join(p["text"] for p in subject_parts)
    body = flatten(body_paragraphs)
    documents = documents_for(campaign, recipient)

    return {
        "recipient": {
            "id": recipient.id,
            "email": recipient.email,
            "name": recipient.name,
            "org": recipient.org,
            "role": recipient.role,
        },
        "subject_parts": subject_parts,
        "body_paragraphs": body_paragraphs,
        "subject": subject,
        "body": body,
        "documents": [{"id": d.id, "name": d.name} for d in documents],
        "gmail_url": gmail_compose_url(recipient, subject, body),
    }


def log_note(campaign, recipient) -> str:
    if campaign.intensity == "Tokens only":
        return "tokens filled"
    if (campaign.grounding or "").strip():
        return f"grounded opener for {recipient.org or recipient.email}"
    return f"generic opener for {recipient.org or recipient.email}"
