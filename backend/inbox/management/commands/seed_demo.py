"""Seeds a demo mailbox so the UI can be driven without Gmail credentials.

    python manage.py seed_demo --user demo --password demo

The dataset mirrors the prototype's fixtures, so the seeded app looks like the
design handoff. Everything is scoped to the named user and re-runnable.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from campaigns.models import Campaign, CampaignDocument, CampaignRecipient
from campaigns.services import composer
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

User = get_user_model()

# (id, from_name, from_email, subject, preview, category, priority, needs_reply,
#  effort, hours_ago, topics, due_hour)
MAIL = [
    ("1", "Maya Okonkwo", "maya.okonkwo@northline.co",
     "Contract redline - needs your sign-off today",
     "Attached the marked-up version, section 4 is the only open item.",
     "Clients", Priority.URGENT, True, 12, 3, "contract legal agreement signature deal", 18),
    ("2", "Stripe", "receipts@stripe.com", "Payout of $4,120.00 is on the way",
     "Expected to arrive Sep 3. No action needed.",
     "Receipts", Priority.LATER, False, 1, 4, "money payment payout finance bank income", None),
    ("3", "Devon Hart", "devon@hartmedia.fm", "Re: podcast slot - can we lock Thursday?",
     "Either 2pm or 4pm works on my end, whichever is easier.",
     "Collabs", Priority.SOON, True, 4, 5, "meeting scheduling calendar podcast interview", None),
    ("4", "The Long Read", "hello@thelongread.com", "This week: nine essays you missed",
     "Plus our editor's pick and a reader mailbag.",
     "Newsletters", Priority.LATER, False, 1, 6, "reading articles digest media", None),
    ("5", "Priya Raman", "priya@ramanstudio.in", "Invoice #2291 is 12 days overdue",
     "Following up on the March retainer - let me know if it's stuck.",
     "Clients", Priority.URGENT, True, 8, 7, "money invoice billing overdue chasing", 11),
    ("6", "Notion", "notify@notion.so", "Aisha commented on Q4 launch plan",
     "Can we move the beta gate a week earlier?",
     "Social", Priority.SOON, True, 3, 26, "comment feedback product launch planning", None),
    ("7", "Tom Bekele", "tom.bekele@creatorsummit.org",
     "Speaking invite - Creator Summit, Nov 14",
     "20 minute keynote, travel covered. Need an answer by Friday.",
     "Collabs", Priority.URGENT, True, 10, 27, "event speaking travel conference invitation", None),
    ("8", "Figma", "billing@figma.com", "Your plan renews in 7 days",
     "Annual plan, 3 editors. Manage billing anytime.",
     "Receipts", Priority.LATER, False, 1, 28, "money billing subscription renewal", None),
    ("9", "Ravi Menon", "ravi.menon@menonbrand.com", "Re: Re: revised scope for the rebrand",
     "Sounds good - one question about the timeline on phase two.",
     "Clients", Priority.SOON, True, 6, 50, "project scope timeline branding design work", None),
    ("10", "Dribbble Weekly", "weekly@dribbble.com", "Top shots of the week",
     "Trending in dark UI, motion, and editorial layout.",
     "Newsletters", Priority.LATER, False, 1, 51, "design inspiration reading digest", None),
]

BRIEFS = {
    "1": ("Sign section 4 of the redline", "Section 4 needs your signature before 6pm today.",
          "On your important list - replies within 2h historically", Confidence.HIGH, "Today, 18:00"),
    "5": ("Confirm status of invoice #2291",
          "Following up on the March retainer - let me know if it's stuck.",
          "On your important list - third follow-up", Confidence.LOW,
          "Mentions a deadline - not confirmed"),
    "7": ("Accept or decline the Nov 14 keynote", "Need an answer by Friday.",
          "On your important list - one-time offer", Confidence.HIGH, "Friday, 18:00"),
}

SUBSCRIPTIONS = [
    ("The Long Read", "hello@thelongread.com", 12, {"30": [0, 0, 0], "90": [0, 0, 0], "180": [1, 0, 0]}),
    ("Dribbble Weekly", "weekly@dribbble.com", 4, {"30": [0, 0, 0], "90": [0, 0, 0], "180": [0, 0, 0]}),
    ("Figma Product", "news@figma.com", 3, {"30": [2, 1, 0], "90": [6, 3, 0], "180": [11, 5, 0]}),
    ("SaaS Growth Daily", "daily@saasgrowth.io", 30, {"30": [0, 0, 22], "90": [0, 0, 64], "180": [0, 0, 128]}),
    ("Notion Digest", "digest@notion.so", 4, {"30": [1, 0, 0], "90": [4, 1, 0], "180": [8, 2, 0]}),
    ("Crypto Signals Pro", "alerts@cryptosignalspro.net", 60, {"30": [0, 0, 41], "90": [0, 0, 119], "180": [0, 0, 240]}),
    ("Design Tools Weekly", "hi@designtools.week", 4, {"30": [0, 0, 1], "90": [1, 0, 3], "180": [2, 0, 5]}),
    ("Retail Offers Club", "offers@retailclub.biz", 45, {"30": [0, 0, 33], "90": [0, 0, 96], "180": [0, 0, 190]}),
]

AGENDA = [("Standup", 9, 0, 9, 15), ("Design review", 10, 30, 11, 30), ("Lunch", 12, 30, 13, 0),
          ("1:1 - Priya", 14, 0, 14, 30), ("Client call - Northwind", 15, 30, 16, 30)]

RECIPIENTS = [
    ("nadia@northwind.studio", "Nadia Faruk", "Northwind Studio", "Senior Product Designer"),
    ("marcus.lee@heliolabs.com", "Marcus Lee", "Helio Labs", "Product Design Lead"),
    ("a.tanaka@fernpath.io", "Aiko Tanaka", "Fernpath", "Design Systems Engineer"),
    ("sam@brightmeridian.co", "Sam Oduya", "Bright Meridian", "Senior UX Designer"),
    ("petra@loomstack.dev", "Petra Kovacs", "Loomstack", "Product Designer"),
    ("d.whitfield@cobaltrow.com", "Dan Whitfield", "Cobalt Row", "Staff Product Designer"),
    ("ines@palewater.design", "Ines Duarte", "Palewater", "Design Manager"),
    ("yusuf.kaya@tandemgrid.io", "Yusuf Kaya", "Tandem Grid", "Senior Interaction Designer"),
    ("grace@vellum.co", "Grace Oyelaran", "Vellum Co", "Brand Designer"),
    ("t.reuter@orchardnine.com", "Tobias Reuter", "Orchard Nine", "Head of Design"),
]

VIPS = ["maya.okonkwo@northline.co", "priya@ramanstudio.in", "tom.bekele@creatorsummit.org"]


class Command(BaseCommand):
    help = "Seeds a demo mailbox, schedule and campaign for the given user."

    def add_arguments(self, parser):
        parser.add_argument("--user", default="demo", help="Username to seed (created if absent)")
        parser.add_argument("--password", default="demo", help="Password for a newly created user")
        parser.add_argument("--clear", action="store_true", help="Remove existing seeded data first")

    @transaction.atomic
    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            username=options["user"], defaults={"email": f"{options['user']}@dayone.studio"}
        )
        if created:
            user.set_password(options["password"])
            user.save()
            self.stdout.write(self.style.SUCCESS(f"Created user {user.username}"))

        if options["clear"]:
            MailMessage.objects.filter(user=user).delete()
            MailThread.objects.filter(user=user).delete()
            Subscription.objects.filter(user=user).delete()
            CalendarSlot.objects.filter(user=user).delete()
            SlotAssignment.objects.filter(user=user).delete()
            VipSender.objects.filter(user=user).delete()
            Campaign.objects.filter(user=user).delete()

        now = timezone.localtime()
        today = now.date()

        for row in MAIL:
            (mid, name, email, subject, preview, category, priority,
             needs_reply, effort, hours_ago, topics, due_hour) = row
            due_at = None
            if due_hour is not None:
                due_at = timezone.make_aware(datetime.combine(today, time(hour=due_hour)))

            thread, _ = MailThread.objects.update_or_create(
                id=f"thread-{mid}", user=user,
                defaults={"subject": subject, "latest_timestamp": now - timedelta(hours=hours_ago)},
            )
            if mid in BRIEFS:
                ask, evidence, why, confidence, due_text = BRIEFS[mid]
                MailThread.objects.filter(pk=thread.pk).update(
                    brief_ask=ask, brief_evidence=evidence, brief_why=why,
                    brief_confidence=confidence, brief_due_text=due_text,
                    brief_due_at=due_at if confidence == Confidence.HIGH else None,
                    brief_parsed_at=now,
                )

            MailMessage.objects.update_or_create(
                id=mid, user=user,
                defaults={
                    "thread": thread, "from_name": name, "from_email": email,
                    "to": [user.email], "subject": subject, "preview": preview,
                    "timestamp": now - timedelta(hours=hours_ago),
                    "category": category, "priority": priority, "needs_reply": needs_reply,
                    "effort_minutes": effort, "topics": topics, "due_at": due_at,
                    "is_unread": needs_reply, "classified_at": now,
                },
            )

        for email in VIPS:
            VipSender.objects.get_or_create(user=user, email=email)

        for name, email, per_month, stats in SUBSCRIPTIONS:
            Subscription.objects.update_or_create(
                user=user, sender_email=email,
                defaults={
                    "sender_name": name, "messages_per_month": per_month,
                    "window_stats": stats, "status": SubscriptionStatus.ACTIVE,
                    "list_unsubscribe": f"<mailto:unsubscribe@{email.split('@')[1]}>",
                    "last_activity_at": now - timedelta(days=2),
                },
            )

        CalendarSlot.objects.filter(user=user, date=today).delete()
        CalendarSlot.objects.bulk_create(
            [
                CalendarSlot(
                    user=user, date=today, title=title,
                    start_time=time(sh, sm), end_time=time(eh, em),
                )
                for title, sh, sm, eh, em in AGENDA
            ]
        )

        campaign, _ = Campaign.objects.update_or_create(
            user=user, name="Design leads - September",
            defaults={
                "list_name": "design-leads-sept.csv", "use_case": "Job application",
                "subject_template": composer.USE_CASES["Job application"]["subject"],
                "body_template": composer.USE_CASES["Job application"]["body"],
            },
        )
        campaign.documents.all().delete()
        CampaignDocument.objects.bulk_create([
            CampaignDocument(campaign=campaign, name="Jordan-Diaz-Resume-2026.pdf",
                             size=412_000, attach_rule="", position=0),
            CampaignDocument(campaign=campaign, name="Portfolio-Selects.pdf",
                             size=6_100_000, attach_rule="design", position=1),
        ])
        campaign.recipients.all().delete()
        CampaignRecipient.objects.bulk_create([
            CampaignRecipient(campaign=campaign, email=email, name=name, org=org,
                              role=role, position=index)
            for index, (email, name, org, role) in enumerate(RECIPIENTS)
        ])

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(MAIL)} messages, {len(SUBSCRIPTIONS)} subscriptions, "
                f"{len(AGENDA)} calendar blocks and 1 campaign for '{user.username}'."
            )
        )
