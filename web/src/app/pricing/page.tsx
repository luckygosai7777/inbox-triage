import type { Metadata } from 'next';
import Link from 'next/link';

import Footer from '@/components/Footer';
import MarketingNav from '@/components/MarketingNav';

export const metadata: Metadata = {
  title: 'Pricing — Owed',
  description: 'Free to start. ₹99 a month for people who live in their inbox.',
  robots: { index: true, follow: true },
};

/**
 * Prices are in rupees because that is where the customers are. Each plan's
 * limits are not arbitrary — they are set by what a user costs to serve, which
 * is dominated by the LLM calls a sync makes. See the note in the README on
 * unit economics before changing any number here.
 */
const PLANS = [
  {
    name: 'Free',
    price: '₹0',
    cadence: 'forever',
    pitch: 'Enough to find out what you have forgotten.',
    cta: 'Start free',
    featured: false,
    features: [
      ['One Google account', true],
      ['25 messages per sync', true],
      ['The ledger — everything you owe', true],
      ['Reply schedule from your calendar', true],
      ['Sync by hand, twice a day', true],
      ['Automatic daily sync', false],
      ['Daily digest email', false],
      ['Sent mail older than 30 days', false],
    ] as const,
  },
  {
    name: 'Pro',
    price: '₹99',
    cadence: 'per month',
    pitch: 'For people whose reputation runs on replying.',
    cta: 'Start free, upgrade later',
    featured: true,
    features: [
      ['Everything in Free', true],
      ['200 messages per sync', true],
      ['Automatic daily sync', true],
      ['Daily digest of what is due', true],
      ['Full sent-mail history', true],
      ['Thread reader and reply drafts', true],
      ['Subscription cleanup', true],
      ['Email support', true],
    ] as const,
  },
  {
    name: 'Team',
    price: '₹399',
    cadence: 'per person / month',
    pitch: 'When somebody else needs to see the ledger too.',
    cta: 'Talk to us',
    featured: false,
    features: [
      ['Everything in Pro', true],
      ['Shared team ledger', true],
      ['See what is owed across the team', true],
      ['Handover when someone is away', true],
      ['Priority sync', true],
      ['Audit log', true],
      ['Onboarding call', true],
      ['Invoice billing', true],
    ] as const,
  },
];

const FAQ = [
  {
    q: 'Do I need a card to start?',
    a: 'No. The free plan needs a Google account and nothing else. You will not be asked for payment details until you choose to upgrade.',
  },
  {
    q: 'What happens if I hit the free limits?',
    a: 'Syncs pause until the next day and older sent mail is not scanned. Nothing is deleted, and the ledger you already have keeps working.',
  },
  {
    q: 'Why is there a message limit at all?',
    a: 'Every sync reads your mail with a language model, and that has a real per-message cost. The limits are what let the price stay at ₹99 rather than ten times that. If you regularly need more, tell us — we would rather know than have you hit a wall.',
  },
  {
    q: 'Can I cancel?',
    a: 'Any time, from Settings. You keep Pro until the end of the period you have paid for, then drop to Free. Nothing is deleted when you downgrade.',
  },
  {
    q: 'Is GST included?',
    a: 'Prices shown are exclusive of GST. Indian customers will see 18% added at checkout where applicable.',
  },
  {
    q: 'Do you take UPI?',
    a: 'Yes — UPI, cards, net banking and wallets, through Razorpay. UPI Autopay handles the monthly renewal.',
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
            Less than one missed reply
          </h1>
          <p className="hero-sub">
            One forgotten promise costs more than a year of this. Start free — you only find out
            whether it is worth paying for after you see your first list.
          </p>

          <div className="price-grid">
            {PLANS.map((plan) => (
              <div key={plan.name} className={plan.featured ? 'price-card featured' : 'price-card'}>
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
            Prices in Indian rupees, exclusive of GST. Pay by UPI, card or net banking. Cancel any
            time from Settings. Two months free on annual plans.
          </p>
        </div>
      </section>

      <section className="marketing-section band">
        <div className="marketing-wrap" style={{ maxWidth: 760 }}>
          <h2 className="section-title">Pricing questions</h2>
          <div className="stack gap-12" style={{ marginTop: 28 }}>
            {FAQ.map((item) => (
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
