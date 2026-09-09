"""Search ranking: AND semantics and field weighting."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from inbox.models import MailMessage, MailThread, Priority
from inbox.services import search

User = get_user_model()


class SearchTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("searcher", "s@x.co")
        self.thread = MailThread.objects.create(
            id="t1", user=self.user, subject="t", latest_timestamp=timezone.now()
        )
        self.maya = self._message(
            "1", "Maya Okonkwo", "maya.okonkwo@northline.co",
            "Contract redline - needs your sign-off today",
            "Attached the marked-up version, section 4 is the only open item.",
            "Clients", Priority.URGENT, "contract legal agreement signature",
        )
        self.priya = self._message(
            "2", "Priya Raman", "priya@ramanstudio.in",
            "Invoice #2291 is 12 days overdue",
            "Following up on the March retainer.",
            "Clients", Priority.URGENT, "money invoice billing payment overdue",
        )
        self.stripe = self._message(
            "3", "Stripe", "receipts@stripe.com",
            "Payout of $4,120.00 is on the way",
            "Expected to arrive Sep 3. No action needed.",
            "Receipts", Priority.LATER, "money payment payout finance bank",
        )

    def _message(self, mid, name, email, subject, preview, category, priority, topics):
        return MailMessage.objects.create(
            id=mid, user=self.user, thread=self.thread,
            from_name=name, from_email=email, subject=subject, preview=preview,
            category=category, priority=priority, topics=topics,
            timestamp=timezone.now(),
        )

    def _ids(self, query):
        everything = [self.maya, self.priya, self.stripe]
        return [h.message.id for h in search.search(everything, query)]

    def test_empty_query_returns_everything(self):
        self.assertEqual(len(self._ids("")), 3)

    def test_sender_name_match(self):
        self.assertEqual(self._ids("maya"), ["1"])

    def test_address_match(self):
        self.assertEqual(self._ids("ramanstudio"), ["2"])

    def test_topic_keyword_finds_mail_with_no_literal_match(self):
        # "money" appears in neither subject nor preview of the Stripe payout.
        self.assertIn("3", self._ids("money"))

    def test_tokens_are_anded_not_ored(self):
        # Both terms must hit the same message.
        self.assertEqual(self._ids("priya invoice"), ["2"])

    def test_and_semantics_can_return_nothing(self):
        self.assertEqual(self._ids("maya invoice"), [])

    def test_sender_outranks_body_mention(self):
        results = self._ids("stripe")
        self.assertEqual(results[0], "3")

    def test_word_start_beats_mid_word(self):
        hit_start = search.score_message(self.maya, ["contract"])
        hit_mid = search.score_message(self.maya, ["ontract"])
        self.assertGreater(hit_start.score, hit_mid.score)

    def test_person_hit_is_flagged_for_address_display(self):
        hits = search.search([self.maya], "maya")
        self.assertTrue(hits[0].matched_person)

        hits = search.search([self.maya], "redline")
        self.assertFalse(hits[0].matched_person)

    def test_search_is_case_insensitive(self):
        self.assertEqual(self._ids("MAYA"), ["1"])

    def test_priority_label_is_searchable(self):
        self.assertEqual(sorted(self._ids("urgent")), ["1", "2"])

    def test_ranking_is_stable_and_scored(self):
        hits = search.search([self.maya, self.priya, self.stripe], "money")
        scores = [h.score for h in hits]
        self.assertEqual(scores, sorted(scores, reverse=True))
