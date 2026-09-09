"""Gap finding and reply packing."""
from __future__ import annotations

from datetime import date, datetime, time

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from inbox.models import CalendarSlot, MailMessage, MailThread, Priority
from inbox.services import scheduler

User = get_user_model()
DAY = date(2026, 9, 2)


def make_meetings():
    """The prototype's agenda: standup, design review, lunch, 1:1, client call."""
    return [
        scheduler.Meeting("Standup", 9.0, 9.25),
        scheduler.Meeting("Design review", 10.5, 11.5),
        scheduler.Meeting("Lunch", 12.5, 13.0),
        scheduler.Meeting("1:1 - Priya", 14.0, 14.5),
        scheduler.Meeting("Client call", 15.5, 16.5),
    ]


class FreeGapTests(TestCase):
    def test_gaps_sit_between_meetings(self):
        slots = scheduler.free_gaps(make_meetings(), block_minutes=30)
        spans = [(s.start, s.end) for s in slots]
        self.assertEqual(
            spans,
            [(9.25, 10.5), (11.5, 12.5), (13.0, 14.0), (14.5, 15.5), (16.5, 18.0)],
        )

    def test_block_minutes_caps_capacity(self):
        slots = scheduler.free_gaps(make_meetings(), block_minutes=15)
        self.assertTrue(all(s.cap == 15 for s in slots))

    def test_short_gap_is_dropped(self):
        meetings = [
            scheduler.Meeting("A", 9.0, 10.0),
            scheduler.Meeting("B", 10.1, 12.0),  # a 6 minute gap
        ]
        slots = scheduler.free_gaps(meetings, block_minutes=30)
        self.assertNotIn((10.0, 10.1), [(s.start, s.end) for s in slots])

    def test_empty_calendar_gives_one_long_block(self):
        slots = scheduler.free_gaps([], block_minutes=30)
        self.assertEqual(len(slots), 1)
        self.assertEqual((slots[0].start, slots[0].end), (9.0, 18.0))
        self.assertEqual(slots[0].cap, 30)  # capped, not the full 540 minutes

    def test_overlapping_meetings_do_not_create_negative_gaps(self):
        meetings = [
            scheduler.Meeting("A", 9.0, 12.0),
            scheduler.Meeting("B", 10.0, 11.0),  # fully inside A
        ]
        slots = scheduler.free_gaps(meetings, block_minutes=30)
        self.assertEqual([(s.start, s.end) for s in slots], [(12.0, 18.0)])

    def test_hhmm_formatting(self):
        self.assertEqual(scheduler.hhmm(9.25), "09:15")
        self.assertEqual(scheduler.hhmm(16.5), "16:30")
        self.assertEqual(scheduler.hhmm(18.0), "18:00")


class PackingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("packer", "packer@x.co")
        self.slots = scheduler.free_gaps(make_meetings(), block_minutes=30)

    def _message(self, mid, effort, priority=Priority.SOON, due_hour=None):
        thread = MailThread.objects.create(
            id=f"t{mid}", user=self.user, subject=f"s{mid}", latest_timestamp=timezone.now()
        )
        due = None
        if due_hour is not None:
            due = timezone.make_aware(datetime.combine(DAY, time(hour=due_hour)))
        return MailMessage.objects.create(
            id=mid,
            user=self.user,
            thread=thread,
            from_email=f"{mid}@x.co",
            subject=f"s{mid}",
            timestamp=timezone.now(),
            priority=priority,
            needs_reply=True,
            effort_minutes=effort,
            due_at=due,
        )

    def test_everything_fits_when_there_is_room(self):
        messages = [self._message(f"m{i}", 5) for i in range(4)]
        plan = scheduler.pack(messages, self.slots, day=DAY)
        placed = sum(len(v) for v in plan.by_slot.values())
        self.assertEqual(placed, 4)
        self.assertEqual(plan.overflow, [])

    def test_deadline_work_lands_before_its_deadline(self):
        urgent = self._message("urgent", 10, Priority.URGENT, due_hour=11)
        filler = [self._message(f"f{i}", 10, Priority.LATER) for i in range(3)]
        plan = scheduler.pack([*filler, urgent], self.slots, day=DAY)

        slot_key = next(k for k, v in plan.by_slot.items() if urgent in v)
        slot = next(s for s in self.slots if s.key == slot_key)
        self.assertLessEqual(slot.start, 11)
        self.assertFalse(scheduler.violates_deadline(urgent, slot, DAY))

    def test_capacity_is_never_exceeded_by_the_packer(self):
        messages = [self._message(f"m{i}", 12) for i in range(20)]
        plan = scheduler.pack(messages, self.slots, day=DAY)
        for slot in self.slots:
            self.assertLessEqual(plan.used[slot.key], slot.cap)

    def test_work_that_does_not_fit_overflows(self):
        messages = [self._message(f"m{i}", 25) for i in range(10)]
        plan = scheduler.pack(messages, self.slots, day=DAY)
        self.assertTrue(plan.overflow)
        self.assertEqual(
            len(messages), sum(len(v) for v in plan.by_slot.values()) + len(plan.overflow)
        )

    def test_load_spreads_instead_of_front_loading(self):
        messages = [self._message(f"m{i}", 10) for i in range(5)]
        plan = scheduler.pack(messages, self.slots, day=DAY)
        used = [plan.used[s.key] for s in self.slots]
        # No single block absorbs everything while others sit empty.
        self.assertLess(max(used), sum(used))
        self.assertGreaterEqual(sum(1 for u in used if u > 0), 2)

    def test_manual_assignment_wins_over_the_packer(self):
        message = self._message("pinned", 10, Priority.LATER)
        target = self.slots[-1].key
        plan = scheduler.pack([message], self.slots, {"pinned": target}, day=DAY)
        self.assertIn(message, plan.by_slot[target])

    def test_pinning_beyond_capacity_is_honoured_and_visible(self):
        # A manual move is the user's call; it is allowed to overfill, and the
        # UI shows the block as over capacity rather than silently relocating.
        messages = [self._message(f"m{i}", 25) for i in range(3)]
        target = self.slots[0].key
        plan = scheduler.pack(messages, self.slots, {m.id: target for m in messages}, day=DAY)
        self.assertEqual(len(plan.by_slot[target]), 3)
        self.assertGreater(plan.used[target], self.slots[0].cap)

    def test_assignment_to_an_unknown_slot_falls_back_to_packing(self):
        message = self._message("m1", 5)
        plan = scheduler.pack([message], self.slots, {"m1": "does-not-exist"}, day=DAY)
        self.assertEqual(sum(len(v) for v in plan.by_slot.values()), 1)

    def test_deadline_on_another_day_does_not_constrain_today(self):
        message = self._message("later", 10, Priority.SOON)
        message.due_at = timezone.make_aware(datetime.combine(date(2026, 9, 20), time(9)))
        message.save()
        plan = scheduler.pack([message], self.slots, day=DAY)
        self.assertEqual(sum(len(v) for v in plan.by_slot.values()), 1)

    def test_deadline_before_every_block_overflows_rather_than_lying(self):
        message = self._message("missed", 10, Priority.URGENT, due_hour=8)
        plan = scheduler.pack([message], self.slots, day=DAY)
        self.assertIn(message, plan.overflow)


class BuildPlanTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("planner", "planner@x.co")
        CalendarSlot.objects.create(
            user=self.user, date=DAY, start_time=time(10, 30), end_time=time(11, 30),
            title="Design review",
        )

    def test_only_reply_work_is_scheduled(self):
        thread = MailThread.objects.create(
            id="t1", user=self.user, subject="s", latest_timestamp=timezone.now()
        )
        MailMessage.objects.create(
            id="needs", user=self.user, thread=thread, from_email="a@x.co",
            timestamp=timezone.now(), needs_reply=True, effort_minutes=5,
        )
        MailMessage.objects.create(
            id="newsletter", user=self.user, thread=thread, from_email="b@x.co",
            timestamp=timezone.now(), needs_reply=False, effort_minutes=1,
        )
        plan = scheduler.build_plan(self.user, day=DAY)
        scheduled = [m.id for group in plan.by_slot.values() for m in group]
        self.assertEqual(scheduled, ["needs"])

    def test_meetings_are_read_from_the_calendar(self):
        plan = scheduler.build_plan(self.user, day=DAY)
        self.assertEqual([m.title for m in plan.meetings], ["Design review"])
