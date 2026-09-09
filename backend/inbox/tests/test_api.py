"""Mail, subscription, VIP and schedule endpoints."""
from __future__ import annotations

from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from inbox.models import (
    CalendarSlot,
    Confidence,
    MailMessage,
    MailThread,
    Priority,
    SlotAssignment,
    Subscription,
    SubscriptionStatus,
    VipSender,
)
from inbox.services import llm, subscriptions as subs_service

User = get_user_model()


class ApiTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("jordan", "jordan@dayone.studio")
        self.other = User.objects.create_user("someone", "someone@else.co")
        self.client.force_login(self.user)
        self.thread = MailThread.objects.create(
            id="t1", user=self.user, subject="Contract redline",
            latest_timestamp=timezone.now(),
        )

    def make_message(self, mid="m1", user=None, **kwargs):
        thread = kwargs.pop("thread", None)
        owner = user or self.user
        if thread is None:
            thread = (
                self.thread
                if owner == self.user
                else MailThread.objects.create(
                    id=f"t-{mid}", user=owner, subject="x", latest_timestamp=timezone.now()
                )
            )
        defaults = dict(
            user=owner, thread=thread, from_email="maya@northline.co",
            from_name="Maya Okonkwo", subject="Contract redline - sign-off",
            preview="Section 4 is the only open item.", timestamp=timezone.now(),
            category="Clients", priority=Priority.URGENT, needs_reply=True,
            effort_minutes=12,
        )
        defaults.update(kwargs)
        return MailMessage.objects.create(id=mid, **defaults)


class AuthTests(ApiTestCase):
    def test_anonymous_is_refused(self):
        self.client.logout()
        self.assertIn(self.client.get("/api/mail/").status_code, (401, 403))

    def test_me_reports_signed_out_without_erroring(self):
        self.client.logout()
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["authenticated"])

    def test_me_reports_the_signed_in_user(self):
        body = self.client.get("/api/auth/me/").json()
        self.assertTrue(body["authenticated"])
        self.assertEqual(body["email"], "jordan@dayone.studio")
        self.assertFalse(body["google_connected"])


@override_settings(DEBUG=True)
class DevLoginTests(TestCase):
    """Password sign-in exists for local development and must never ship on."""

    def setUp(self):
        self.user = User.objects.create_user("localdev", "localdev@x.co", "s3cret-pw")

    def test_signs_in_with_valid_credentials(self):
        response = self.client.post(
            "/api/auth/dev-login/",
            {"username": "localdev", "password": "s3cret-pw"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["authenticated"])
        self.assertTrue(self.client.get("/api/auth/me/").json()["authenticated"])

    def test_wrong_password_is_rejected(self):
        response = self.client.post(
            "/api/auth/dev-login/",
            {"username": "localdev", "password": "wrong"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertFalse(self.client.get("/api/auth/me/").json()["authenticated"])

    def test_missing_fields_are_rejected(self):
        response = self.client.post(
            "/api/auth/dev-login/", {"username": "localdev"}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)

    def test_me_advertises_the_dev_form_in_debug(self):
        self.assertTrue(self.client.get("/api/auth/me/").json()["dev_login_available"])

    @override_settings(DEBUG=False)
    def test_disabled_outside_debug(self):
        response = self.client.post(
            "/api/auth/dev-login/",
            {"username": "localdev", "password": "s3cret-pw"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.client.get("/api/auth/me/").json()["authenticated"])

    @override_settings(DEBUG=False)
    def test_form_is_not_advertised_outside_debug(self):
        self.assertFalse(self.client.get("/api/auth/me/").json()["dev_login_available"])


class MailListTests(ApiTestCase):
    def test_lists_only_the_requesting_users_mail(self):
        self.make_message("mine")
        self.make_message("theirs", user=self.other)
        body = self.client.get("/api/mail/").json()
        self.assertEqual([r["id"] for r in body["results"]], ["mine"])

    def test_archived_mail_is_hidden(self):
        self.make_message("live")
        self.make_message("gone", is_archived=True)
        body = self.client.get("/api/mail/").json()
        self.assertEqual([r["id"] for r in body["results"]], ["live"])

    def test_needs_reply_filter(self):
        self.make_message("reply", needs_reply=True)
        self.make_message("news", needs_reply=False, category="Newsletters")
        body = self.client.get("/api/mail/?filter=Needs reply").json()
        self.assertEqual([r["id"] for r in body["results"]], ["reply"])

    def test_category_filter(self):
        self.make_message("client", category="Clients")
        self.make_message("receipt", category="Receipts", needs_reply=False)
        body = self.client.get("/api/mail/?filter=Receipts").json()
        self.assertEqual([r["id"] for r in body["results"]], ["receipt"])

    def test_filter_counts_accompany_the_list(self):
        self.make_message("a", needs_reply=True)
        self.make_message("b", needs_reply=False, category="Newsletters")
        counts = {f["label"]: f["count"] for f in self.client.get("/api/mail/").json()["filters"]}
        self.assertEqual(counts["All"], 2)
        self.assertEqual(counts["Needs reply"], 1)
        self.assertEqual(counts["Newsletters"], 1)

    def test_search_narrows_and_flags_person_hits(self):
        self.make_message("maya")
        self.make_message("other", from_email="tom@x.co", from_name="Tom", subject="Speaking invite")
        body = self.client.get("/api/mail/?search=maya").json()
        self.assertEqual([r["id"] for r in body["results"]], ["maya"])
        self.assertTrue(body["results"][0]["show_address"])

    def test_blacklisted_senders_disappear_from_the_inbox(self):
        self.make_message("spam", from_email="alerts@cryptosignalspro.net")
        Subscription.objects.create(
            user=self.user, sender_email="alerts@cryptosignalspro.net",
            status=SubscriptionStatus.MUTED, muted_at=timezone.now(),
        )
        body = self.client.get("/api/mail/").json()
        self.assertEqual(body["results"], [])

    def test_vip_flag_is_reported(self):
        self.make_message("m1")
        VipSender.objects.create(user=self.user, email="maya@northline.co")
        body = self.client.get("/api/mail/").json()
        self.assertTrue(body["results"][0]["is_vip"])

    def test_bad_priority_is_rejected(self):
        self.assertEqual(self.client.get("/api/mail/?priority=high").status_code, 400)

    def test_pagination(self):
        for i in range(5):
            self.make_message(f"m{i}")
        body = self.client.get("/api/mail/?limit=2&offset=2").json()
        self.assertEqual(body["count"], 5)
        self.assertEqual(len(body["results"]), 2)


class MailActionTests(ApiTestCase):
    def test_archive_without_gmail_still_updates_locally(self):
        self.make_message("m1")
        response = self.client.post("/api/mail/m1/archive/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["remote"])
        self.assertTrue(MailMessage.objects.get(id="m1").is_archived)

    def test_flag_vip_adds_the_sender(self):
        self.make_message("m1")
        response = self.client.post("/api/mail/m1/flag-vip/")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(VipSender.objects.filter(user=self.user, email="maya@northline.co").exists())

    def test_flag_vip_is_idempotent(self):
        self.make_message("m1")
        self.client.post("/api/mail/m1/flag-vip/")
        response = self.client.post("/api/mail/m1/flag-vip/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(VipSender.objects.filter(user=self.user).count(), 1)

    def test_cannot_touch_another_users_mail(self):
        self.make_message("theirs", user=self.other)
        self.assertEqual(self.client.post("/api/mail/theirs/archive/").status_code, 404)

    def test_bulk_delete_removes_rows(self):
        self.make_message("a")
        self.make_message("b")
        response = self.client.post(
            "/api/mail/bulk-delete/", {"message_ids": ["a", "b"]}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(MailMessage.objects.filter(user=self.user).count(), 0)

    def test_bulk_delete_ignores_other_users_ids(self):
        self.make_message("theirs", user=self.other)
        self.client.post(
            "/api/mail/bulk-delete/", {"message_ids": ["theirs"]}, content_type="application/json"
        )
        self.assertTrue(MailMessage.objects.filter(id="theirs").exists())

    def test_sync_without_credentials_reports_conflict(self):
        response = self.client.post("/api/mail/sync/")
        self.assertEqual(response.status_code, 409)


class VipBriefTests(ApiTestCase):
    def test_no_brief_without_vips(self):
        self.make_message("m1")
        self.assertIsNone(self.client.get("/api/mail/vip-brief/").json()["brief"])

    def test_high_confidence_brief_states_the_date(self):
        VipSender.objects.create(user=self.user, email="maya@northline.co")
        due = timezone.now() + timedelta(hours=4)
        MailThread.objects.filter(id="t1").update(
            brief_ask="Sign section 4", brief_why="On your important list",
            brief_due_at=due, brief_due_text="Today, 18:00",
            brief_evidence="Section 4 needs your signature before 6pm today.",
            brief_confidence=Confidence.HIGH, brief_parsed_at=timezone.now(),
        )
        self.make_message("m1")
        brief = self.client.get("/api/mail/vip-brief/").json()["brief"]
        self.assertTrue(brief["due_is_confirmed"])
        self.assertEqual(brief["brief_ask"], "Sign section 4")
        self.assertEqual(brief["from_name"], "Maya Okonkwo")

    def test_low_confidence_brief_refuses_to_assert_a_date(self):
        VipSender.objects.create(user=self.user, email="maya@northline.co")
        MailThread.objects.filter(id="t1").update(
            brief_ask="Confirm invoice status", brief_due_at=None,
            brief_due_text="Mentions a deadline - not confirmed",
            brief_evidence="Let me know if it's stuck.",
            brief_confidence=Confidence.LOW, brief_parsed_at=timezone.now(),
        )
        self.make_message("m1")
        brief = self.client.get("/api/mail/vip-brief/").json()["brief"]
        self.assertFalse(brief["due_is_confirmed"])
        self.assertIsNone(brief["brief_due_at"])
        self.assertIn("not confirmed", brief["brief_due_text"])

    def test_dismiss_hides_the_brief(self):
        VipSender.objects.create(user=self.user, email="maya@northline.co")
        MailThread.objects.filter(id="t1").update(
            brief_ask="Sign it", brief_confidence=Confidence.HIGH, brief_parsed_at=timezone.now()
        )
        self.make_message("m1")
        self.client.post("/api/mail/vip-brief/t1/dismiss/")
        self.assertIsNone(self.client.get("/api/mail/vip-brief/").json()["brief"])


class VipCollectionTests(ApiTestCase):
    def test_add_and_remove(self):
        response = self.client.post(
            "/api/vips/", {"email": "Tom@Creatorsummit.org"}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["email"], "tom@creatorsummit.org")

        vip_id = response.json()["id"]
        self.assertEqual(self.client.delete(f"/api/vips/{vip_id}/").status_code, 204)
        self.assertEqual(VipSender.objects.count(), 0)

    def test_invalid_address_is_rejected(self):
        response = self.client.post(
            "/api/vips/", {"email": "not-an-address"}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)

    def test_listing_uses_the_name_seen_on_their_mail(self):
        self.make_message("m1")
        VipSender.objects.create(user=self.user, email="maya@northline.co")
        row = self.client.get("/api/vips/").json()["results"][0]
        self.assertEqual(row["display_name"], "Maya Okonkwo")
        self.assertEqual(row["initials"], "MA")


class SubscriptionTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.dead = Subscription.objects.create(
            user=self.user, sender_email="daily@saasgrowth.io", sender_name="SaaS Growth Daily",
            messages_per_month=30, list_unsubscribe="<mailto:stop@saasgrowth.io>",
            window_stats={"30": [0, 0, 22], "90": [0, 0, 64], "180": [0, 0, 128]},
        )
        self.alive = Subscription.objects.create(
            user=self.user, sender_email="news@figma.com", sender_name="Figma Product",
            messages_per_month=3,
            window_stats={"30": [2, 1, 0], "90": [6, 3, 0], "180": [11, 5, 0]},
        )

    def test_dormant_list_excludes_engaged_senders(self):
        body = self.client.get("/api/subscriptions/dormant/?window=90").json()
        self.assertEqual([r["sender_email"] for r in body["results"]], ["daily@saasgrowth.io"])
        self.assertEqual(body["volume_per_month"], 30)

    def test_window_changes_the_verdict(self):
        # Two opens in 30 days is below threshold; six in 90 days is not.
        self.alive.window_stats = {"30": [1, 0, 0], "90": [6, 3, 0], "180": [11, 5, 0]}
        self.alive.save()
        thirty = self.client.get("/api/subscriptions/dormant/?window=30").json()
        ninety = self.client.get("/api/subscriptions/dormant/?window=90").json()
        self.assertIn("news@figma.com", [r["sender_email"] for r in thirty["results"]])
        self.assertNotIn("news@figma.com", [r["sender_email"] for r in ninety["results"]])

    def test_unsubscribe_marks_the_row(self):
        response = self.client.post(f"/api/subscriptions/{self.dead.id}/unsubscribe/")
        self.assertEqual(response.status_code, 200)
        self.dead.refresh_from_db()
        self.assertEqual(self.dead.status, SubscriptionStatus.UNSUBSCRIBED)

    def test_blacklist_records_a_recoverable_hold(self):
        response = self.client.post(f"/api/subscriptions/{self.dead.id}/blacklist/")
        self.assertEqual(response.status_code, 200)
        self.dead.refresh_from_db()
        self.assertEqual(self.dead.status, SubscriptionStatus.MUTED)
        self.assertIsNotNone(self.dead.hold_expires_at)
        self.assertIsNotNone(response.json()["hold_expires_at"])

    def test_resubscribe_reverses_a_mute(self):
        self.client.post(f"/api/subscriptions/{self.dead.id}/blacklist/")
        self.client.post(f"/api/subscriptions/{self.dead.id}/resubscribe/")
        self.dead.refresh_from_db()
        self.assertEqual(self.dead.status, SubscriptionStatus.ACTIVE)
        self.assertIsNone(self.dead.muted_at)

    def test_bulk_action(self):
        response = self.client.post(
            "/api/subscriptions/bulk/",
            {"action": "blacklist", "subscription_ids": [self.dead.id, self.alive.id]},
            content_type="application/json",
        )
        self.assertEqual(response.json()["updated"], 2)
        self.assertEqual(
            Subscription.objects.filter(user=self.user, status=SubscriptionStatus.MUTED).count(), 2
        )

    def test_bulk_rejects_unknown_action(self):
        response = self.client.post(
            "/api/subscriptions/bulk/",
            {"action": "delete-everything", "subscription_ids": [self.dead.id]},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_unsubscribed_sender_is_not_dormant(self):
        subs_service.unsubscribe(self.user, self.dead)
        body = self.client.get("/api/subscriptions/dormant/?window=90").json()
        self.assertEqual(body["results"], [])

    def test_marking_a_click_lifts_dormancy(self):
        subs_service.mark_click(self.dead, window_days=90)
        self.dead.refresh_from_db()
        self.assertFalse(self.dead.is_dormant(90))

    def test_cannot_act_on_another_users_subscription(self):
        theirs = Subscription.objects.create(user=self.other, sender_email="x@y.co")
        self.assertEqual(
            self.client.post(f"/api/subscriptions/{theirs.id}/blacklist/").status_code, 404
        )


class MetricsTests(ApiTestCase):
    def test_metric_cards(self):
        self.make_message("a", needs_reply=True)
        self.make_message("b", needs_reply=True)
        self.make_message("c", needs_reply=False, priority=Priority.LATER, is_unread=False)
        Subscription.objects.create(
            user=self.user, sender_email="d@x.co", messages_per_month=12,
            window_stats={"90": [0, 0, 3]},
        )
        body = self.client.get("/api/metrics/?window=90").json()
        self.assertEqual(body["needs_reply"], 2)
        self.assertEqual(body["clearable"], 1)
        self.assertEqual(body["dormant_count"], 1)
        self.assertEqual(body["dormant_volume"], 12)


class ScheduleApiTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.day = timezone.localdate()
        CalendarSlot.objects.create(
            user=self.user, date=self.day, start_time=time(10, 30),
            end_time=time(11, 30), title="Design review",
        )

    def test_schedule_reports_blocks_and_meetings(self):
        self.make_message("m1", effort_minutes=12)
        body = self.client.get("/api/schedule/").json()
        kinds = {row["type"] for row in body["rows"]}
        self.assertEqual(kinds, {"slot", "meeting"})
        self.assertEqual(body["total_reply_minutes"], 12)
        self.assertTrue(body["fits"])

    def test_rows_are_in_time_order(self):
        self.make_message("m1")
        rows = self.client.get("/api/schedule/").json()["rows"]
        starts = [r["start_hour"] for r in rows]
        self.assertEqual(starts, sorted(starts))

    def test_block_minutes_must_be_a_supported_value(self):
        self.assertEqual(self.client.get("/api/schedule/?block_minutes=7").status_code, 400)

    def test_assign_pins_a_message(self):
        self.make_message("m1")
        slot_key = next(
            r["key"] for r in self.client.get("/api/schedule/").json()["rows"] if r["type"] == "slot"
        )
        response = self.client.post(
            "/api/schedule/assign/",
            {"message_ids": ["m1"], "slot_key": slot_key},
            content_type="application/json",
        )
        self.assertEqual(response.json()["assigned"], 1)
        self.assertTrue(SlotAssignment.objects.filter(user=self.user, message_id="m1").exists())

    def test_assign_ignores_foreign_messages(self):
        self.make_message("theirs", user=self.other)
        response = self.client.post(
            "/api/schedule/assign/",
            {"message_ids": ["theirs"], "slot_key": "g0"},
            content_type="application/json",
        )
        self.assertEqual(response.json()["assigned"], 0)

    def test_rebuild_clears_manual_moves(self):
        self.make_message("m1")
        self.client.post(
            "/api/schedule/assign/",
            {"message_ids": ["m1"], "slot_key": "g1"},
            content_type="application/json",
        )
        response = self.client.post("/api/schedule/rebuild/", content_type="application/json")
        self.assertEqual(response.json()["cleared_assignments"], 1)
        self.assertEqual(SlotAssignment.objects.count(), 0)

    def test_overflow_is_reported_when_the_day_is_full(self):
        for i in range(30):
            self.make_message(f"m{i}", effort_minutes=25)
        body = self.client.get("/api/schedule/?block_minutes=15").json()
        self.assertGreater(body["overflow_count"], 0)
        self.assertFalse(body["fits"])
        self.assertGreater(body["shortfall_minutes"], 0)


@override_settings(LLM_ENABLED=False)
class HeuristicClassificationTests(ApiTestCase):
    """With the model switched off, classification must still be sensible."""

    def test_receipt_is_low_priority_and_needs_no_reply(self):
        message = self.make_message(
            "r", from_name="Stripe", from_email="receipts@stripe.com",
            subject="Payout of $4,120.00 is on the way",
            preview="Expected to arrive Sep 3. No action needed.",
        )
        result = llm.heuristic_classify(message, "", is_list_mail=True)
        self.assertEqual(result["category"], "Receipts")
        self.assertFalse(result["needs_reply"])
        self.assertEqual(result["priority"], Priority.LATER)

    def test_a_question_from_a_person_needs_a_reply(self):
        message = self.make_message(
            "q", from_name="Devon Hart", from_email="devon@hartmedia.fm",
            subject="Re: podcast slot - can we lock Thursday?",
            preview="Either 2pm or 4pm works on my end, let me know.",
        )
        result = llm.heuristic_classify(message, "")
        self.assertTrue(result["needs_reply"])
        self.assertLessEqual(result["priority"], Priority.SOON)

    def test_a_stated_deadline_raises_priority_and_sets_due_at(self):
        message = self.make_message(
            "d", subject="Contract redline",
            preview="Section 4 needs your signature before 6pm today.",
        )
        result = llm.heuristic_classify(message, "")
        self.assertEqual(result["priority"], Priority.URGENT)
        self.assertIsNotNone(result["due_at"])

    def test_newsletter_is_categorised_from_list_headers(self):
        message = self.make_message(
            "n", from_name="The Long Read", from_email="hello@thelongread.com",
            subject="This week: nine essays you missed", preview="Plus our editor's pick.",
        )
        result = llm.heuristic_classify(message, "", is_list_mail=True)
        self.assertEqual(result["category"], "Newsletters")
        self.assertFalse(result["needs_reply"])

    def test_classify_messages_writes_results_back(self):
        message = self.make_message("c", priority=Priority.LATER, needs_reply=False)
        count = llm.classify_messages(self.user, [message])
        self.assertEqual(count, 1)
        message.refresh_from_db()
        self.assertIsNotNone(message.classified_at)
