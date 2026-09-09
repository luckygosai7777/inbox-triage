import type { Metadata } from 'next';
import Link from 'next/link';

import Footer from '@/components/Footer';
import MarketingNav from '@/components/MarketingNav';

export const metadata: Metadata = {
  title: 'Pricing — Inbox Triage',
  description: 'Free to start. Pro for people who live in their inbox.',
  robots: { index: true, follow: true },
};

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    pitch: 'Enough to find out what you have forgotten.',
    cta: 'Start free',
    featured: false,
    features: [
      ['One Google account', true],
      ['50 messages per sync', true],
      ['Commitment ledger', true],
      ['Reply schedule from your calendar', true],
      ['3 syncs per day', true],
      ['Sent-mail history beyond 30 days', false],
      ['Daily digest email', false],
      ['Priority support', false],
    ] as const,
  },
  {
    name: 'Pro',
    price: '$12',
    cadence: 'per month',
    pitch: 'For people whose reputation runs on replying.',
    cta: 'Start free, upgrade later',
    featured: true,
    features: [
      ['Everything in Free', true],
      ['500 messages per sync', true],
      ['Unlimited sent-mail history', true],
      ['Hourly automatic sync', true],
      ['Daily digest of what is due', true],
      ['Bulk send composer', true],
      ['Subscription cleanup', true],
      ['Priority support', true],
    ] as const,
  },
  {
    name: 'Team',
    price: '$29',
    cadence: 'per seat / month',
    pitch: 'When somebody else needs to see the ledger too.',
    cta: 'Talk to us',
    featured: false,
    features: [
      ['Everything in Pro', true],
      ['Shared team ledger', true],
      ['See what is owed across the team', true],
      ['Handover when someone is away', true],
      ['SAML single sign-on', true],
      ['Audit log', true],
      ['Data residency options', true],
      ['Onboarding call', true],
    ] as const,
  },
];

export default function PricingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <MarketingNav />

      <section className="marketing-section" style={{ paddingBottom: 40 }}>
        <div className="marketing-wrap">
          <span className="eyebrow">Pricing</span>
          <h1 className="hero-title" style={{ fontSize: 'clamp(30px, 4.4vw, 46px)' }}>
            Cheaper than the client you lose
          </h1>
          <p className="hero-sub">
            One forgotten promise costs more than a year of this. Start free — you only find out
            whether it is worth paying for after you see your first list.
          </p>

          <div className="price-grid">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={plan.featured ? 'price-card featured' : 'price-card'}
              >
                {plan.featured && (
                  <span className="eyebrow" style={{ marginBottom: 14 }}>
                    Most popular
                  </span>
                )}
                <div className="h3">{plan.name}</div>
                <div className="row gap-8 mt-12" style={{ alignItems: 'baseline' }}>
                  <span className="price-amount">{plan.price}</span>
                  <span className="small muted">{plan.cadence}</span>
                </div>
                <p className="small secondary" style={{ marginTop: 10, minHeight: 40 }}>
                  {plan.pitch}
                </p>

                <Link
                  href="/login"
                  className={plan.featured ? 'btn btn-primary btn-block' : 'btn btn-block'}
                  style={{ textDecoration: 'none', marginTop: 4 }}
                >
                  {plan.cta}
                </Link>

                <ul className="price-list">
                  {plan.features.map(([label, on]) => (
                    <li key={label} className={on ? '' : 'off'}>
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="small muted" style={{ marginTop: 24 }}>
            Prices in USD, excluding any local sales tax. Cancel any time from Settings.
          </p>
        </div>
      </section>

      <section className="marketing-section band">
        <div className="marketing-wrap" style={{ maxWidth: 760 }}>
          <h2 className="section-title">Pricing questions</h2>
          <div className="stack gap-12" style={{ marginTop: 28 }}>
            {[
              {
                q: 'Do I need a card to start?',
                a: 'No. The free plan needs a Google account and nothing else.',
              },
              {
                q: 'What happens if I hit the free limits?',
                a: 'Syncs stop until the next day, and older sent mail is not scanned. Nothing is deleted, and the ledger you already have keeps working.',
              },
              {
                q: 'Can I cancel?',
                a: 'Any time, from Settings. You keep Pro until the end of the period you paid for, then drop to Free. Nothing is deleted on downgrade.',
              },
              {
                q: 'Is there a discount for annual billing?',
                a: 'Two months free on annual plans. Choose it at checkout.',
              },
            ].map((item) => (
              <details key={item.q} className="faq">
                <summary>{item.q}</summary>
                <p className="small secondary" style={{ marginTop: 10, lineHeight: 1.7 }}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
