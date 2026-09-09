"""Parsing helpers: addresses, deadlines, list headers."""
from __future__ import annotations

from datetime import datetime

from django.test import SimpleTestCase
from django.utils import timezone

from inbox.services import parsing


class SplitAddressTests(SimpleTestCase):
    def test_named_address(self):
        self.assertEqual(
            parsing.split_address("Maya Okonkwo <maya.okonkwo@northline.co>"),
            ("Maya Okonkwo", "maya.okonkwo@northline.co"),
        )

    def test_bare_address_gets_a_derived_name(self):
        name, email = parsing.split_address("priya.raman@ramanstudio.in")
        self.assertEqual(email, "priya.raman@ramanstudio.in")
        self.assertEqual(name, "Priya Raman")

    def test_address_is_lowercased(self):
        _, email = parsing.split_address("<Billing@Figma.COM>")
        self.assertEqual(email, "billing@figma.com")

    def test_address_list(self):
        self.assertEqual(
            parsing.split_address_list("A <a@x.co>, b@y.co"),
            ["a@x.co", "b@y.co"],
        )

    def test_empty_list(self):
        self.assertEqual(parsing.split_address_list(""), [])


class DeadlineTests(SimpleTestCase):
    def setUp(self):
        # A Wednesday, so weekday arithmetic is unambiguous.
        self.now = timezone.make_aware(datetime(2026, 9, 2, 9, 0))

    def test_explicit_time_today_is_high_confidence(self):
        result = parsing.extract_deadline(
            "Section 4 needs your signature before 6pm today.", now=self.now
        )
        self.assertTrue(result.matched)
        self.assertEqual(result.confidence, "high")
        self.assertEqual(result.due_at.hour, 18)
        self.assertEqual(result.due_at.date(), self.now.date())
        self.assertIn("Section 4", result.evidence)

    def test_by_weekday_resolves_forward(self):
        result = parsing.extract_deadline("Need an answer by Friday.", now=self.now)
        self.assertTrue(result.matched)
        self.assertEqual(result.due_at.date().isoweekday(), 5)
        self.assertGreater(result.due_at, self.now)

    def test_same_weekday_rolls_to_next_week(self):
        result = parsing.extract_deadline("Get it to me by Wednesday.", now=self.now)
        self.assertEqual((result.due_at.date() - self.now.date()).days, 7)

    def test_end_of_day(self):
        result = parsing.extract_deadline("Please send by end of day.", now=self.now)
        self.assertTrue(result.matched)
        self.assertEqual(result.due_at.hour, 18)

    def test_tomorrow(self):
        result = parsing.extract_deadline("I need it by tomorrow.", now=self.now)
        self.assertEqual((result.due_at.date() - self.now.date()).days, 1)

    def test_am_pm_conversion(self):
        result = parsing.extract_deadline("by 9am today", now=self.now)
        self.assertEqual(result.due_at.hour, 9)

    def test_vague_follow_up_is_not_a_deadline(self):
        result = parsing.extract_deadline(
            "Following up on the March retainer - let me know if it's stuck.",
            now=self.now,
        )
        self.assertFalse(result.matched)
        self.assertEqual(result.confidence, "low")
        self.assertIsNone(result.due_at)

    def test_nonsense_hour_is_rejected(self):
        result = parsing.extract_deadline("by 47 today", now=self.now)
        self.assertFalse(result.matched)

    def test_evidence_is_the_sentence_not_the_whole_body(self):
        body = "Hi there. Section 4 needs your signature before 6pm today. Thanks!"
        result = parsing.extract_deadline(body, now=self.now)
        self.assertEqual(
            result.evidence, "Section 4 needs your signature before 6pm today."
        )


class ListHeaderTests(SimpleTestCase):
    def test_parses_both_targets(self):
        header = "<mailto:unsub@list.co?subject=stop>, <https://list.co/unsub/abc>"
        parsed = parsing.parse_list_unsubscribe(header)
        self.assertEqual(parsed["mailto"], "unsub@list.co")
        self.assertEqual(parsed["url"], "https://list.co/unsub/abc")

    def test_empty_header(self):
        self.assertEqual(parsing.parse_list_unsubscribe(""), {})

    def test_list_mail_detection(self):
        self.assertTrue(parsing.looks_like_list_mail({"list-unsubscribe": "<mailto:x@y.co>"}))
        self.assertTrue(parsing.looks_like_list_mail({"precedence": "bulk"}))
        self.assertFalse(parsing.looks_like_list_mail({"from": "a@b.co"}))


class BodyExtractionTests(SimpleTestCase):
    def test_prefers_plain_text_over_html(self):
        import base64

        def encode(text):
            return base64.urlsafe_b64encode(text.encode()).decode()

        payload = {
            "mimeType": "multipart/alternative",
            "parts": [
                {"mimeType": "text/plain", "body": {"data": encode("plain body")}},
                {"mimeType": "text/html", "body": {"data": encode("<p>html body</p>")}},
            ],
        }
        self.assertEqual(parsing.extract_body_text(payload), "plain body")

    def test_falls_back_to_stripped_html(self):
        import base64

        payload = {
            "mimeType": "text/html",
            "body": {"data": base64.urlsafe_b64encode(b"<p>hello <b>there</b></p>").decode()},
        }
        self.assertEqual(parsing.extract_body_text(payload), "hello there")

    def test_attachment_detection(self):
        payload = {
            "parts": [
                {"filename": "", "body": {}},
                {"filename": "resume.pdf", "body": {"attachmentId": "abc"}},
            ]
        }
        self.assertTrue(parsing.has_attachment(payload))
        self.assertFalse(parsing.has_attachment({"parts": [{"filename": "", "body": {}}]}))
