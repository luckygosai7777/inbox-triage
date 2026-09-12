import type { Metadata } from 'next';
import Link from 'next/link';

import Footer from '@/components/Footer';
import MarketingNav from '@/components/MarketingNav';

export const metadata: Metadata = {
  title: 'Pricing — Owed',
  description: 'Free forever on the rules engine. ₹499 a month when you want the model.',
  robots: { index: true, follow: true },
};

/*
 * WHAT A USER ACTUALLY COSTS
 *
 * Every number below is derived, not chosen. Rates are Anthropic list price at
 * $1/$5 per MTok (Haiku 4.5, the workhorse) and $2/$10 (Sonnet 5, drafting),
 * converted at ₹88 to the dollar. Re-derive these before moving any price;
 * they are the only thing keeping the plans solvent.
 *
 *   Sorting one message      ~3,200 in + 600 out per batch of 10   ₹0.055
 *   Mining one message for
 *     the ledger             ~1,800 in + 250 out                   ₹0.26
 *   Writing one draft        ~2,900 in + 300 out on Sonnet 5       ₹0.78
 *
 * Which gives, per month:
 *
 *   Pro    3,000 sorted + 300 mined + 60 drafts    ≈ ₹290
 *   Studio 9,000 sorted + 900 mined + 300 drafts   ≈ ₹920
 *
 * Two fixed costs sit on top, and the first one is easy to miss:
 *
 *   Vercel Hobby forbids commercial use. The day Owed takes a rupee it needs
 *   Vercel Pro at $20/month (₹1,760). Supabase is free until 500MB, then $25.
 *   Call it ₹1,850/month of fixed cost from the first paying customer.
 *
 * At ₹499 with ₹290 of variable cost and ~2.4% to Razorpay, each Pro user
 * contributes about ₹197. Fixed costs are covered at ELEVEN paying users.
 * Below that the project runs at a loss, and that is worth knowing before
 * building a checkout rather than after.
 *
 * THE FREE PLAN IS NOT A CRIPPLED PAID PLAN
 *
 * Free runs the rules engine: header-based sender detection, the imperative
 * ask patterns, local deadline parsing. That is genuinely good now, it costs
 * essentially nothing to run, and it is the honest line — free gets the
 * rules, paid gets the model. Ten drafts a month on the house so the thing
 * can be judged before it is bought (₹8 of cost, the cheapest trial there is).
 */
const PLANS = [
  {
    name: 'Free',
    price: '₹0',
    cadence: 'forever',
    pitch: 'The rules engine, in full. No card, no trial clock.',
    cta: 'Start free',
    featured: false,
    features: [
      ['One Google account', true],
      ['Sorting by sender and language rules', true],
      ['The ledger — everything you owe', true],
      ['Reply schedule from your calendar', true],
      ['50 messages per sync, by hand', true],
      ['10 drafted replies a month', true],
      ['Drafts in your own voice', false],
      ['Automatic daily sync and digest', false],
    ] as const,
  },
  {
    name: 'Pro',
    price: '₹499',
    cadence: 'per month',
    pitch: 'For people whose reputation runs on replying.',
    cta: 'Start free, upgrade later',
    featured: true,
    features: [
      ['Everything in Free', true],
      ['Sorting read by a language model', true],
      ['100 messages per sync', true],
      ['60 drafted replies a month', true],
      ['Drafts written in your own voice', true],
      ['Automatic daily sync', true],
      ['Daily digest of what is due', true],
      ['Full sent-mail history', true],
    ] as const,
  },
  {
    name: 'Studio',
    price: '₹1,299',
    cadence: 'per month',
    pitch: 'When you answer the same question forty times a week.',
    cta: 'Talk to us',
    featured: false,
    features: [
      ['Everything in Pro', true],
      ['300 messages per sync', true],
      ['300 drafted replies a month', true],
      ['Draft to many clients at once', true],
      ['Sync every hour', true],
      ['Subscription cleanup', true],
      ['Priority support', true],
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
    q: 'What is actually different about the free plan?',
    a: 'Free sorts your mail with rules — who sent it, what the headers say, whether the words are a request. Paid reads it with a language model, which is better at the ambiguous middle: a polite chase, a half-question, a client being indirect. Both put things in the ledger, both find deadlines. The rules are not a demo, they are the same rules the paid plan falls back on.',
  },
  {
    q: 'Why are drafts limited rather than unlimited?',
    a: 'A drafted reply costs about ₹0.78 of model time to write, so sixty of them is most of what ₹499 buys. Unlimited would either mean a worse model or a higher price, and we would rather tell you the number than quietly make the writing worse.',
  },
  {
    q: 'Does Owed send email on my behalf?',
    a: 'Yes — you write or generate a reply in Owed and press send, and it goes from your own Gmail account, in the right thread. What Owed will never do is send on its own. There is no scheduled send, no auto-reply, and no path by which a message leaves your account without you having read it and pressed the button. A tool that can email your clients unattended is a different and much more frightening product.',
  },
  {
    q: 'What happens if I hit a limit?',
    a: 'Sorting falls back to the rules engine and drafting pauses until the next month. Nothing is deleted, the ledger keeps working, and you are told which limit you hit rather than left wondering why it got worse.',
  },
  {
    q: 'Can I cancel?',
    a: 'Any time, from Settings. You keep your plan until the end of the period you have paid for, then drop to Free. Nothing is deleted when you downgrade.',
  },
  {
    q: 'Is GST included?',
    a: 'Prices shown are exclusive of GST. Indian customers will see 18% added at checkout where applicable.',
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
