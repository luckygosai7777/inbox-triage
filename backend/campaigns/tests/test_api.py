"""Campaign endpoints: the four steps, rate limiting and the review loop."""
from __future__ import annotations

import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from campaigns.models import (
    Campaign,
    CampaignDocument,
    CampaignLogEntry,
    CampaignRecipient,
    CampaignState,
)

User = get_user_model()


class CampaignTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("jordan", "jordan@dayone.studio")
        self.other = User.objects.create_user("someone", "someone@else.co")
        self.client.force_login(self.user)

    def make_campaign(self, recipients=3, **kwargs):
        campaign = Campaign.objects.create(
            user=kwargs.pop("user", self.user),
            subject_template="[role] - Jordan Diaz",
            body_template="Hi [first],\n\n[ai_opener]\n\nAbout [org].\n\n[ai_signoff]\nJordan",
            **kwargs,
        )
        for i in range(recipients):
            CampaignRecipient.objects.create(
                campaign=campaign, email=f"p{i}@example.com", name=f"Person {i}",
                org=f"Org {i}", role="Product Designer", position=i,
            )
        return campaign

    def post(self, url, payload=None):
        return self.client.post(url, json.dumps(payload or {}), content_type="application/json")

    def patch(self, url, payload):
        return self.client.patch(url, json.dumps(payload), content_type="application/json")


class CampaignCrudTests(CampaignTestCase):
    def test_create_seeds_templates_from_the_use_case(self):
        response = self.post("/api/campaigns/", {"use_case": "Sales intro"})
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertIn("[org]", body["subject_template"])
        self.assertEqual(body["state"], "idle")
        self.assertEqual(body["step"], 1)

    def test_unknown_use_case_is_rejected(self):
        self.assertEqual(self.post("/api/campaigns/", {"use_case": "Nonsense"}).status_code, 400)

    def test_switching_use_case_reseeds_the_templates(self):
        campaign = self.make_campaign()
        response = self.patch(f"/api/campaigns/{campaign.id}/", {"use_case": "Recruiter outreach"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("would you be open to a chat", response.json()["subject_template"])

    def test_invalid_tone_is_rejected(self):
        campaign = self.make_campaign()
        response = self.patch(f"/api/campaigns/{campaign.id}/", {"tone": "Shouty"})
        self.assertEqual(response.status_code, 400)

    def test_cannot_read_another_users_campaign(self):
        theirs = self.make_campaign(user=self.other)
        self.assertEqual(self.client.get(f"/api/campaigns/{theirs.id}/").status_code, 404)

    def test_use_cases_endpoint_lists_templates_and_tokens(self):
        body = self.client.get("/api/campaigns/use-cases/").json()
        self.assertEqual(len(body["use_cases"]), 4)
        self.assertIn("[first]", body["tokens"])
        self.assertEqual(body["intensities"], ["Tokens only", "Tokens + opener"])


class DocumentTests(CampaignTestCase):
    def test_add_document_by_name(self):
        campaign = self.make_campaign()
        response = self.post(
            f"/api/campaigns/{campaign.id}/documents/",
            {"name": "Resume.pdf", "size": 412000, "attach_rule": ""},
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["documents"][0]["attaches_to_all"])

    def test_rule_label_explains_the_condition(self):
        campaign = self.make_campaign()
        response = self.post(
            f"/api/campaigns/{campaign.id}/documents/",
            {"name": "Portfolio.pdf", "attach_rule": "design"},
        )
        self.assertIn("design", response.json()["documents"][0]["rule_label"])

    def test_update_and_delete_a_rule(self):
        campaign = self.make_campaign()
        document = CampaignDocument.objects.create(campaign=campaign, name="A.pdf")
        response = self.patch(
            f"/api/campaigns/{campaign.id}/documents/{document.id}/", {"attach_rule": "engineer"}
        )
        self.assertEqual(response.json()["attach_rule"], "engineer")
        self.assertEqual(
            self.client.delete(f"/api/campaigns/{campaign.id}/documents/{document.id}/").status_code,
            204,
        )

    def test_empty_document_post_is_rejected(self):
        campaign = self.make_campaign()
        self.assertEqual(
            self.post(f"/api/campaigns/{campaign.id}/documents/", {}).status_code, 400
        )


class RecipientTests(CampaignTestCase):
    def test_add_one_by_hand(self):
        campaign = self.make_campaign(recipients=0)
        response = self.post(
            f"/api/campaigns/{campaign.id}/add-recipient/",
            {"email": "New@Example.com", "name": "New Person", "role": "Designer"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["email"], "new@example.com")
        self.assertEqual(response.json()["org"], "Example")  # derived from the domain

    def test_short_name_is_rejected(self):
        campaign = self.make_campaign(recipients=0)
        response = self.post(
            f"/api/campaigns/{campaign.id}/add-recipient/", {"email": "a@b.co", "name": "A"}
        )
        self.assertEqual(response.status_code, 400)

    def test_duplicate_address_is_refused(self):
        campaign = self.make_campaign(recipients=1)
        response = self.post(
            f"/api/campaigns/{campaign.id}/add-recipient/",
            {"email": "p0@example.com", "name": "Person Zero"},
        )
        self.assertEqual(response.status_code, 409)

    def test_queued_recipient_can_be_removed(self):
        campaign = self.make_campaign(recipients=3)
        last = campaign.recipients.last()
        response = self.client.delete(f"/api/campaigns/{campaign.id}/recipients/{last.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(campaign.recipients.count(), 2)

    def test_already_reviewed_recipient_cannot_be_removed(self):
        campaign = self.make_campaign(recipients=3, cursor=2)
        first = campaign.recipients.first()
        response = self.client.delete(f"/api/campaigns/{campaign.id}/recipients/{first.id}/")
        self.assertEqual(response.status_code, 409)

    def test_positions_stay_contiguous_after_a_delete(self):
        campaign = self.make_campaign(recipients=4)
        middle = campaign.recipients.all()[1]
        self.client.delete(f"/api/campaigns/{campaign.id}/recipients/{middle.id}/")
        positions = list(campaign.recipients.order_by("position").values_list("position", flat=True))
        self.assertEqual(positions, [0, 1, 2])

    def test_csv_import_replaces_the_list(self):
        campaign = self.make_campaign(recipients=2)
        response = self.post(
            f"/api/campaigns/{campaign.id}/import/",
            {
                "text": "email,name,org,role\nx@y.co,Ex Why,Wye Co,Design Lead\n",
                "list_name": "leads.csv",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["imported"], 1)
        campaign.refresh_from_db()
        self.assertEqual(campaign.recipients.count(), 1)
        self.assertEqual(campaign.list_name, "leads.csv")

    def test_csv_import_can_append(self):
        campaign = self.make_campaign(recipients=2)
        self.post(
            f"/api/campaigns/{campaign.id}/import/",
            {"text": "email,name\nx@y.co,Ex Why\n", "replace": False},
        )
        self.assertEqual(campaign.recipients.count(), 3)

    def test_csv_with_no_valid_rows_is_rejected(self):
        campaign = self.make_campaign()
        response = self.post(f"/api/campaigns/{campaign.id}/import/", {"text": "nope\nstill nope\n"})
        self.assertEqual(response.status_code, 400)


class PreviewTests(CampaignTestCase):
    def test_preview_renders_and_marks_ai_text(self):
        campaign = self.make_campaign()
        body = self.client.get(f"/api/campaigns/{campaign.id}/preview/?index=0").json()
        self.assertEqual(body["recipient"]["email"], "p0@example.com")
        self.assertIn("Hi Person,", body["body"])
        flagged = [
            part["text"]
            for paragraph in body["body_paragraphs"]
            for part in paragraph["parts"]
            if part["ai"]
        ]
        self.assertTrue(flagged)

    def test_preview_reports_grounding_state(self):
        campaign = self.make_campaign()
        self.assertFalse(self.client.get(f"/api/campaigns/{campaign.id}/preview/").json()["is_grounded"])

        campaign.grounding = "We are hiring a staff designer."
        campaign.save()
        body = self.client.get(f"/api/campaigns/{campaign.id}/preview/").json()
        self.assertTrue(body["is_grounded"])
        self.assertIn("You mentioned", body["body"])

    def test_preview_needs_recipients(self):
        campaign = self.make_campaign(recipients=0)
        self.assertEqual(self.client.get(f"/api/campaigns/{campaign.id}/preview/").status_code, 400)

    def test_preview_index_is_clamped(self):
        campaign = self.make_campaign(recipients=2)
        body = self.client.get(f"/api/campaigns/{campaign.id}/preview/?index=99").json()
        self.assertEqual(body["recipient"]["email"], "p1@example.com")


class ReviewFlowTests(CampaignTestCase):
    def test_review_requires_the_approval_checkbox(self):
        campaign = self.make_campaign()
        self.assertEqual(
            self.post(f"/api/campaigns/{campaign.id}/begin-review/").status_code, 400
        )

        campaign.approved = True
        campaign.save()
        response = self.post(f"/api/campaigns/{campaign.id}/begin-review/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["state"], "review")

    def test_next_returns_the_current_recipient_and_a_gmail_link(self):
        campaign = self.make_campaign(approved=True, state=CampaignState.REVIEW)
        body = self.client.get(f"/api/campaigns/{campaign.id}/next/").json()
        self.assertEqual(body["next"]["recipient"]["email"], "p0@example.com")
        self.assertIn("mail.google.com", body["next"]["gmail_url"])
        self.assertTrue(body["next"]["can_send"])

    def test_send_record_advances_and_logs(self):
        campaign = self.make_campaign(approved=True, state=CampaignState.REVIEW)
        response = self.post(f"/api/campaigns/{campaign.id}/send-record/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["cursor"], 1)
        self.assertEqual(body["window_used"], 1)
        self.assertEqual(CampaignLogEntry.objects.filter(campaign=campaign).count(), 1)

    def test_skip_advances_without_logging_or_charging_the_window(self):
        campaign = self.make_campaign(approved=True, state=CampaignState.REVIEW)
        body = self.post(f"/api/campaigns/{campaign.id}/send-record/", {"skipped": True}).json()
        self.assertEqual(body["cursor"], 1)
        self.assertEqual(body["window_used"], 0)
        self.assertEqual(CampaignLogEntry.objects.count(), 0)

    def test_finishing_the_list_marks_the_campaign_done(self):
        campaign = self.make_campaign(recipients=2, approved=True, state=CampaignState.REVIEW)
        self.post(f"/api/campaigns/{campaign.id}/send-record/")
        body = self.post(f"/api/campaigns/{campaign.id}/send-record/").json()
        self.assertEqual(body["state"], "done")
        self.assertEqual(body["remaining_count"], 0)

    def test_send_record_on_an_exhausted_list_is_rejected(self):
        campaign = self.make_campaign(recipients=1, approved=True, state=CampaignState.REVIEW)
        self.post(f"/api/campaigns/{campaign.id}/send-record/")
        self.assertEqual(
            self.post(f"/api/campaigns/{campaign.id}/send-record/").status_code, 400
        )

    def test_reset_returns_everything_to_the_queue(self):
        campaign = self.make_campaign(recipients=2, approved=True, state=CampaignState.REVIEW)
        self.post(f"/api/campaigns/{campaign.id}/send-record/")
        body = self.post(f"/api/campaigns/{campaign.id}/reset/").json()
        self.assertEqual(body["cursor"], 0)
        self.assertEqual(body["state"], "idle")
        self.assertFalse(body["approved"])
        self.assertEqual(body["window_used"], 0)
        self.assertEqual(CampaignLogEntry.objects.count(), 0)


class RateLimitTests(CampaignTestCase):
    def test_batch_cap_blocks_further_sends(self):
        campaign = self.make_campaign(
            recipients=4, approved=True, state=CampaignState.REVIEW, batch_cap=2
        )
        self.post(f"/api/campaigns/{campaign.id}/send-record/")
        self.post(f"/api/campaigns/{campaign.id}/send-record/")

        response = self.post(f"/api/campaigns/{campaign.id}/send-record/")
        self.assertEqual(response.status_code, 429)
        self.assertIn("resets_at", response.json())

    def test_skipping_still_works_while_capped(self):
        campaign = self.make_campaign(
            recipients=4, approved=True, state=CampaignState.REVIEW, batch_cap=1
        )
        self.post(f"/api/campaigns/{campaign.id}/send-record/")
        response = self.post(f"/api/campaigns/{campaign.id}/send-record/", {"skipped": True})
        self.assertEqual(response.status_code, 200)

    def test_window_resets_after_the_cooldown(self):
        campaign = self.make_campaign(
            recipients=4, approved=True, state=CampaignState.REVIEW,
            batch_cap=1, cooldown_hours=6,
        )
        self.post(f"/api/campaigns/{campaign.id}/send-record/")
        campaign.refresh_from_db()
        self.assertEqual(campaign.window_remaining(), 0)

        # Rewind the window past the cooldown.
        campaign.window_start = timezone.now() - timedelta(hours=7)
        campaign.save(update_fields=["window_start"])
        self.assertEqual(campaign.window_remaining(), 1)
        self.assertEqual(campaign.window_used(), 0)

        self.assertEqual(self.post(f"/api/campaigns/{campaign.id}/send-record/").status_code, 200)

    def test_next_reports_the_cap_being_spent(self):
        campaign = self.make_campaign(
            recipients=3, approved=True, state=CampaignState.REVIEW, batch_cap=1
        )
        self.post(f"/api/campaigns/{campaign.id}/send-record/")
        body = self.client.get(f"/api/campaigns/{campaign.id}/next/").json()
        self.assertFalse(body["next"]["can_send"])
        self.assertEqual(body["next"]["window_remaining"], 0)
