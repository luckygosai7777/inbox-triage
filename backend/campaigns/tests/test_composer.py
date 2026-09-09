"""Token substitution, opener grounding and the Gmail deep link."""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from django.contrib.auth import get_user_model
from django.test import TestCase

from campaigns.models import Campaign, CampaignDocument, CampaignRecipient, Intensity, Tone
from campaigns.services import composer

User = get_user_model()


class ComposerTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("jordan", "jordan@dayone.studio")
        self.campaign = Campaign.objects.create(
            user=self.user,
            subject_template="[role] - Jordan Diaz",
            body_template="Hi [first],\n\n[ai_opener]\n\nAbout [org].\n\n[ai_signoff]\nJordan",
        )
        self.recipient = CampaignRecipient.objects.create(
            campaign=self.campaign, email="nadia@northwind.studio", name="Nadia Faruk",
            org="Northwind Studio", role="Senior Product Designer", position=0,
        )

    def texts(self, paragraphs):
        return [composer.flatten([p]) for p in paragraphs]

    def ai_parts(self, paragraphs):
        return [
            part["text"]
            for paragraph in paragraphs
            for part in paragraph["parts"]
            if part["ai"]
        ]


class TokenTests(ComposerTestCase):
    def test_tokens_are_filled_from_the_recipient(self):
        rendered = composer.compose(self.campaign.body_template, self.recipient, self.campaign)
        body = composer.flatten(rendered)
        self.assertIn("Hi Nadia,", body)
        self.assertIn("About Northwind Studio.", body)
        self.assertNotIn("[first]", body)
        self.assertNotIn("[org]", body)

    def test_first_name_is_the_first_word(self):
        self.assertEqual(self.recipient.first_name, "Nadia")

    def test_csv_values_are_not_marked_as_ai_written(self):
        rendered = composer.compose("Hi [first] at [org].", self.recipient, self.campaign)
        self.assertEqual(self.ai_parts(rendered), [])

    def test_opener_is_marked_as_ai_written(self):
        rendered = composer.compose("[ai_opener]", self.recipient, self.campaign)
        ai = self.ai_parts(rendered)
        self.assertEqual(len(ai), 1)
        self.assertIn("Northwind Studio", ai[0])

    def test_unknown_token_is_left_alone(self):
        rendered = composer.compose("Value: [not_a_token]", self.recipient, self.campaign)
        self.assertEqual(composer.flatten(rendered), "Value: [not_a_token]")

    def test_missing_org_falls_back_to_a_neutral_phrase(self):
        self.recipient.org = ""
        rendered = composer.compose("About [org].", self.recipient, self.campaign)
        self.assertEqual(composer.flatten(rendered), "About your team.")

    def test_paragraph_structure_is_preserved(self):
        rendered = composer.compose("One\n\nTwo\n\nThree", self.recipient, self.campaign)
        self.assertEqual(self.texts(rendered), ["One", "Two", "Three"])


class IntensityTests(ComposerTestCase):
    def test_tokens_only_writes_nothing_new(self):
        self.campaign.intensity = Intensity.TOKENS_ONLY
        rendered = composer.compose("[ai_opener]", self.recipient, self.campaign)
        self.assertEqual(composer.flatten(rendered), "Hope this finds you well.")
        self.assertEqual(self.ai_parts(rendered), [])

    def test_formal_signoff_is_not_treated_as_authored(self):
        self.campaign.tone = Tone.FORMAL
        rendered = composer.compose("[ai_signoff]", self.recipient, self.campaign)
        self.assertEqual(composer.flatten(rendered), "Kind regards,")
        self.assertEqual(self.ai_parts(rendered), [])

    def test_non_default_tone_changes_the_signoff(self):
        self.campaign.tone = Tone.WARM
        rendered = composer.compose("[ai_signoff]", self.recipient, self.campaign)
        self.assertEqual(composer.flatten(rendered), "Thanks so much,")
        self.assertEqual(self.ai_parts(rendered), ["Thanks so much,"])


class OpenerTests(ComposerTestCase):
    def test_grounded_opener_quotes_the_source(self):
        self.campaign.grounding = "We are hiring a staff designer for our payments team."
        opener = composer.opener_for(self.recipient, self.campaign.grounding)
        self.assertIn("hiring a staff designer", opener)
        self.assertTrue(opener.startswith("You mentioned"))

    def test_ungrounded_opener_varies_by_role(self):
        systems = CampaignRecipient(campaign=self.campaign, role="Design Systems Engineer", org="Fernpath")
        manager = CampaignRecipient(campaign=self.campaign, role="Head of Design", org="Orchard Nine")
        self.assertIn("design systems", composer.opener_for(systems).lower())
        self.assertIn("design org", composer.opener_for(manager).lower())

    def test_unknown_role_uses_the_fallback(self):
        anyone = CampaignRecipient(campaign=self.campaign, role="Accountant", org="Ledger Co")
        self.assertIn("Ledger Co", composer.opener_for(anyone))

    def test_grounding_beats_role_matching(self):
        opener = composer.opener_for(self.recipient, "We need help with our design system.")
        self.assertTrue(opener.startswith("You mentioned"))


class AttachmentRuleTests(ComposerTestCase):
    def setUp(self):
        super().setUp()
        self.resume = CampaignDocument.objects.create(
            campaign=self.campaign, name="Resume.pdf", attach_rule="", position=0
        )
        self.portfolio = CampaignDocument.objects.create(
            campaign=self.campaign, name="Portfolio.pdf", attach_rule="design", position=1
        )

    def test_blank_rule_attaches_to_everyone(self):
        self.assertTrue(self.resume.applies_to("Accountant"))

    def test_keyword_rule_matches_the_role(self):
        self.assertTrue(self.portfolio.applies_to("Senior Product Designer"))
        self.assertFalse(self.portfolio.applies_to("Accountant"))

    def test_rule_matching_is_case_insensitive(self):
        self.assertTrue(self.portfolio.applies_to("DESIGN LEAD"))

    def test_documents_for_filters_per_recipient(self):
        designer_docs = composer.documents_for(self.campaign, self.recipient)
        self.assertEqual({d.name for d in designer_docs}, {"Resume.pdf", "Portfolio.pdf"})

        accountant = CampaignRecipient(campaign=self.campaign, role="Accountant")
        self.assertEqual(
            [d.name for d in composer.documents_for(self.campaign, accountant)], ["Resume.pdf"]
        )


class GmailLinkTests(ComposerTestCase):
    def test_link_carries_recipient_subject_and_body(self):
        payload = composer.render_for(self.campaign, self.recipient)
        parsed = urlparse(payload["gmail_url"])
        query = parse_qs(parsed.query)

        self.assertEqual(parsed.netloc, "mail.google.com")
        self.assertEqual(query["view"], ["cm"])
        self.assertEqual(query["to"], ["nadia@northwind.studio"])
        self.assertEqual(query["su"], ["Senior Product Designer - Jordan Diaz"])
        self.assertIn("Hi Nadia,", query["body"][0])

    def test_render_includes_the_attachments_the_user_must_add(self):
        CampaignDocument.objects.create(campaign=self.campaign, name="Resume.pdf", attach_rule="")
        payload = composer.render_for(self.campaign, self.recipient)
        self.assertEqual([d["name"] for d in payload["documents"]], ["Resume.pdf"])

    def test_log_note_describes_what_the_model_did(self):
        self.campaign.intensity = Intensity.TOKENS_ONLY
        self.assertEqual(composer.log_note(self.campaign, self.recipient), "tokens filled")

        self.campaign.intensity = Intensity.TOKENS_PLUS_OPENER
        self.assertIn("generic opener", composer.log_note(self.campaign, self.recipient))

        self.campaign.grounding = "We are hiring."
        self.assertIn("grounded opener", composer.log_note(self.campaign, self.recipient))
