"""Calendar-aware reply planning.

Free gaps are derived from the day's busy blocks; each gap donates at most
`block_minutes` to email so the rest of the gap stays the user's. Replies are
then packed deadline-first, then by priority, then shortest-first so a block
fills rather than blocks.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date as date_cls

from django.conf import settings
from django.utils import timezone

from ..models import CalendarSlot, MailMessage, SlotAssignment


@dataclass
class Slot:
    key: str
    start: float          # hours since midnight, local
    end: float
    cap: int              # minutes of email this block will take

    @property
    def length_minutes(self) -> int:
        return int(round((self.end - self.start) * 60))


@dataclass
class Meeting:
    title: str
    start: float
    end: float


@dataclass
class Plan:
    slots: list[Slot]
    meetings: list[Meeting]
    by_slot: dict[str, list[MailMessage]] = field(default_factory=dict)
    used: dict[str, int] = field(default_factory=dict)
    overflow: list[MailMessage] = field(default_factory=list)

    @property
    def total_capacity(self) -> int:
        return sum(s.cap for s in self.slots)


def hhmm(hours: float) -> str:
    h = int(hours)
    m = int(round((hours - h) * 60))
    if m == 60:
        h, m = h + 1, 0
    return f"{h:02d}:{m:02d}"


def busy_blocks(user, day: date_cls) -> list[Meeting]:
    rows = CalendarSlot.objects.filter(user=user, date=day, is_busy=True).order_by("start_time")
    return [Meeting(title=r.title or "Busy", start=r.start_hour, end=r.end_hour) for r in rows]


def free_gaps(meetings: list[Meeting], block_minutes: int | None = None) -> list[Slot]:
    """Gaps between meetings inside working hours, capped at block_minutes each."""
    block_minutes = block_minutes or settings.SCHEDULE_DEFAULT_BLOCK_MINUTES
    day_start = settings.SCHEDULE_DAY_START
    day_end = settings.SCHEDULE_DAY_END
    min_gap_hours = settings.SCHEDULE_MIN_GAP_MINUTES / 60

    gaps: list[tuple[float, float]] = []
    cursor = day_start
    for meeting in sorted(meetings, key=lambda m: m.start):
        if meeting.end <= day_start or meeting.start >= day_end:
            continue
        if meeting.start - cursor >= min_gap_hours:
            gaps.append((cursor, min(meeting.start, day_end)))
        cursor = max(cursor, meeting.end)
    if day_end - cursor >= min_gap_hours:
        gaps.append((cursor, day_end))

    return [
        Slot(
            key=f"g{i}",
            start=start,
            end=end,
            cap=min(int(round((end - start) * 60)), block_minutes),
        )
        for i, (start, end) in enumerate(gaps)
    ]


def _due_hour(message: MailMessage, day: date_cls) -> float | None:
    """The message's deadline as an hour of `day`, or None.

    A deadline that already passed, or falls on a later day, does not constrain
    which block on `day` the reply can go in.
    """
    if not message.due_at:
        return None
    local = timezone.localtime(message.due_at)
    if local.date() != day:
        return None
    return local.hour + local.minute / 60


def _sort_key(message: MailMessage, day: date_cls):
    due = _due_hour(message, day)
    return (
        0 if due is not None else 1,      # deadlines first
        due if due is not None else 0.0,  # earliest deadline first
        message.priority,                 # then urgency
        message.effort_minutes,           # then shortest, so a slot fills
    )


def pack(
    messages: list[MailMessage],
    slots: list[Slot],
    assignments: dict[str, str] | None = None,
    day: date_cls | None = None,
) -> Plan:
    """Packs replies into slots. Manual assignments are honoured verbatim."""
    day = day or timezone.localdate()
    assignments = assignments or {}
    slot_keys = {s.key: s for s in slots}

    plan = Plan(slots=slots, meetings=[])
    plan.by_slot = {s.key: [] for s in slots}
    plan.used = {s.key: 0 for s in slots}

    pinned, loose = [], []
    for message in messages:
        target = assignments.get(str(message.id))
        (pinned if target in slot_keys else loose).append(message)

    # Pinned first: a manual move outranks the packer, even past capacity.
    for message in pinned:
        key = assignments[str(message.id)]
        plan.by_slot[key].append(message)
        plan.used[key] += message.effort_minutes

    for message in sorted(loose, key=lambda m: _sort_key(m, day)):
        due = _due_hour(message, day)
        fits = [
            s
            for s in slots
            if plan.used[s.key] + message.effort_minutes <= s.cap
            and (due is None or s.start <= due)
        ]
        if not fits:
            plan.overflow.append(message)
            continue
        # Deadline work takes the earliest block that works; everything else
        # takes the emptiest, so the day spreads instead of front-loading.
        chosen = fits[0] if due is not None else min(fits, key=lambda s: plan.used[s.key] / s.cap)
        plan.by_slot[chosen.key].append(message)
        plan.used[chosen.key] += message.effort_minutes

    return plan


def build_plan(user, day: date_cls | None = None, block_minutes: int | None = None) -> Plan:
    """Full plan for a day: meetings, gaps, packed replies and overflow."""
    day = day or timezone.localdate()
    meetings = busy_blocks(user, day)
    slots = free_gaps(meetings, block_minutes)

    messages = list(
        MailMessage.objects.filter(user=user, needs_reply=True, is_archived=False)
        .exclude(from_email__in=_muted_senders(user))
        .order_by("priority", "-timestamp")
    )
    assignments = {
        str(a.message_id): a.slot_key
        for a in SlotAssignment.objects.filter(user=user, date=day)
    }

    plan = pack(messages, slots, assignments, day=day)
    plan.meetings = meetings
    return plan


def _muted_senders(user) -> list[str]:
    from ..models import Subscription, SubscriptionStatus

    return list(
        Subscription.objects.filter(user=user, status=SubscriptionStatus.MUTED).values_list(
            "sender_email", flat=True
        )
    )


def violates_deadline(message: MailMessage, slot: Slot, day: date_cls) -> bool:
    """True when a reply sits in a block that starts after its own deadline."""
    due = _due_hour(message, day)
    return due is not None and slot.start > due
