import Link from 'next/link';
import type { Metadata } from 'next';

import MarketingNav from '@/components/MarketingNav';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Owed — the to-do list you never had to write',
  description:
    'Reads your sent mail and tells you what you owe, to whom, and by when. Gmail shows what arrived; this shows what you promised.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Owed — know what you owe',
    description:
      'It reads your sent mail for the promises you made and forgot. One list, ordered by what is late.',
    type: 'website',
  },
};

const STEPS = [
  {
    n: '1',
    title: 'Connect Gmail',
    body: 'One sign-in. We read your mail and calendar. We never send anything on your behalf — every send is a click you make inside Gmail.',
  },
  {
    n: '2',
    title: 'We read what you sent',
    body: 'Not just your inbox — your sent folder. That is where "I\'ll get you the deck by Friday" is buried, and where every other tool stops looking.',
  },
  {
    n: '3',
    title: 'You get one list',
    body: 'Everything you owe, ordered by how late it is, each row quoting the sentence you actually wrote. Nothing to type, nothing to maintain.',
  },
];

const COMPARISON = [
  ['Gmail', 'Sorts what arrived', 'No idea what you promised'],
  ['Boomerang', 'Nags when nobody replies to you', 'The opposite direction'],
  ['Superhuman / Shortwave', 'Faster triage, AI summaries', 'Still only inbound mail'],
  ['Todoist / Things', 'Tracks what you typed in', 'You have to remember to type it'],
];

const FAQ = [
  {
    q: 'Can it send email as me?',
    a: 'No. There is no send API access anywhere in the product. When you reply, it opens a Gmail compose tab pre-filled — you read it and press Send yourself. That is a deliberate design constraint, not a missing feature.',
  },
  {
    q: 'What does it do with my email?',
    a: 'Subjects, previews and body text are read to work out priority and to find promises. Results are stored against your account and nothing else. Your mail is never used to train a model, never sold, and never shared.',
  },
  {
    q: 'How do I know a commitment is real?',
    a: 'Every row quotes the exact sentence it came from. If the sentence has no clear date, the row says "No deadline given" rather than inventing one. You can always check the claim against the source.',
  },
  {
    q: 'What if it gets something wrong?',
    a: 'Hit "Not mine" and it disappears. The extraction is deliberately narrow — "I\'ll be in touch" and "I\'ll try to look" create nothing, because a list full of noise is a list you stop opening.',
  },
  {
    q: 'Can I delete everything?',
    a: 'Settings → Delete account removes every row we hold and revokes our access to your Google account. No retention period, no "contact support to delete".',
  },
];

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <MarketingNav />

      {/* ------------------------------------------------------------ hero */}
      <section className="marketing-section" style={{ paddingTop: 72, paddingBottom: 56 }}>
        <div className="marketing-wrap">
          <span className="eyebrow">For people who answer a lot of email</span>

          <h1 className="hero-title">
            You don’t have an inbox problem.
            <br />
            You have a <span style={{ color: 'var(--accent)' }}>promises</span> problem.
          </h1>

          <p className="hero-sub">
            You wrote “I’ll send it Friday” and moved on. That sentence is now sitting in your Sent
            folder, where nobody will ever read it again — including you. Owed reads it,
            and hands you the list.
          </p>

          <div className="row wrap gap-12" style={{ marginTop: 32 }}>
            <Link href="/login" className="btn btn-primary" style={{ textDecoration: 'none' }}>
              Continue with Google
            </Link>
            <Link href="/pricing" className="btn" style={{ textDecoration: 'none' }}>
              See pricing
            </Link>
          </div>

          <p className="tiny muted" style={{ marginTop: 14 }}>
            Free to start · Never sends mail on your behalf · Delete everything in one click
          </p>

          {/* A picture of the product beats a description of it. */}
          <div className="hero-shot">
            <div className="row gap-8" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)' }}>
              <span className="dot" style={{ background: '#f87171' }} />
              <span className="dot" style={{ background: '#f5c451' }} />
              <span className="dot" style={{ background: '#4ade9b' }} />
              <span className="mono tiny muted" style={{ marginLeft: 8 }}>
                what you owe
              </span>
            </div>

            <div style={{ padding: 20 }}>
              <div className="row gap-12" style={{ alignItems: 'baseline' }}>
                <span className="metric-number">7</span>
                <span className="h2" style={{ fontSize: 16 }}>
                  things you owe people
                </span>
              </div>
              <div className="small mt-4" style={{ color: 'var(--danger)', fontWeight: 600 }}>
                3 of these are already late
              </div>

              <div className="stack gap-8" style={{ marginTop: 18 }}>
                {[
                  {
                    what: 'Send the revised deck',
                    when: '2 days late',
                    who: 'You told Maya Okonkwo you would',
                    quote: '“I’ll send the revised deck by Friday, once legal have looked at section 4.”',
                    late: true,
                  },
                  {
                    what: 'Accept or decline the Nov 14 keynote',
                    when: 'Was due yesterday',
                    who: 'Tom Bekele asked and you haven’t replied',
                    quote: '“Need an answer by Friday so we can lock the running order.”',
                    late: true,
                  },
                  {
                    what: 'Review the rebrand scope doc',
                    when: 'No deadline given',
                    who: 'You told Ravi Menon you would',
                    quote: '“I’ll review the scope doc and get back to you with comments.”',
                    late: false,
                  },
                ].map((row) => (
                  <div key={row.what} className="shot-row">
                    <span
                      className="ledger-rail"
                      style={{ background: row.late ? 'var(--danger)' : 'var(--text-faint)' }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div className="row wrap gap-8" style={{ alignItems: 'baseline' }}>
                        <span className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {row.what}
                        </span>
                        <span
                          className="small"
                          style={{
                            fontWeight: 600,
                            color: row.late ? 'var(--danger)' : 'var(--text-faint)',
                          }}
                        >
                          {row.when}
                        </span>
                      </div>
                      <div className="tiny muted mt-4">{row.who}</div>
                      <div className="evidence">{row.quote}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- problem */}
      <section className="marketing-section band">
        <div className="marketing-wrap">
          <h2 className="section-title">Your to-do list is missing half your work</h2>
          <p className="section-sub">
            Todo apps only know what you typed into them. But most of what you owe was never typed
            anywhere — it was said in passing, in an email, three weeks ago.
          </p>

          <div className="feature-grid" style={{ marginTop: 36 }}>
            <div className="card card-pad">
              <div className="h3">The sentence you forgot</div>
              <p className="small secondary mt-8">
                “I’ll circle back with numbers on Monday.” You meant it. Monday came and went. The
                only record is buried in a thread you have no reason to reopen.
              </p>
            </div>
            <div className="card card-pad">
              <div className="h3">The chase you didn’t notice</div>
              <p className="small secondary mt-8">
                Someone asked you something twelve days ago. It scrolled off the first screen and
                out of your memory. They are still waiting, and getting a slightly worse impression
                of you each day.
              </p>
            </div>
            <div className="card card-pad">
              <div className="h3">The day that never had room</div>
              <p className="small secondary mt-8">
                You planned to “catch up on email today”. You had 43 minutes of gaps and four hours
                of replies. Nobody told you that until 6pm.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section className="marketing-section">
        <div className="marketing-wrap">
          <h2 className="section-title">How it works</h2>
          <div className="feature-grid" style={{ marginTop: 36 }}>
            {STEPS.map((step) => (
              <div key={step.n} className="card card-pad">
                <span className="step-badge">{step.n}</span>
                <div className="h3 mt-12">{step.title}</div>
                <p className="small secondary mt-8">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- comparison */}
      <section className="marketing-section band">
        <div className="marketing-wrap">
          <h2 className="section-title">Why not just use what you have?</h2>
          <p className="section-sub">
            Every one of these is good at something. None of them read your sent mail.
          </p>

          <div className="scroll-x" style={{ marginTop: 28 }}>
            <table className="compare">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>What it does well</th>
                  <th>What it misses</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([tool, does, misses]) => (
                  <tr key={tool}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tool}</td>
                    <td className="secondary">{does}</td>
                    <td className="muted">{misses}</td>
                  </tr>
                ))}
                <tr className="highlight">
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>Owed</td>
                  <td style={{ color: 'var(--text-primary)' }}>
                    Reads your sent mail for promises you made
                  </td>
                  <td className="secondary">Still needs you to press Send</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ trust */}
      <section className="marketing-section">
        <div className="marketing-wrap">
          <h2 className="section-title">Built to be trusted with your mail</h2>
          <p className="section-sub">
            You are handing over correspondence. Here is exactly what happens to it.
          </p>

          <div className="feature-grid" style={{ marginTop: 36 }}>
            {[
              ['It cannot send mail', 'There is no send API access in the product at all. Replies open in Gmail for you to send. The click is always yours.'],
              ['Your tokens are encrypted', 'The key to your mailbox is encrypted with AES-256-GCM before it is stored. The database only ever holds ciphertext.'],
              ['Isolated at the database', 'Row-level security means the database itself refuses to return another account’s rows — not just the app code.'],
              ['It refuses to guess', 'A deadline is only shown when a real date parser confirmed it. Otherwise it says so. An AI that invents due dates is worse than none.'],
              ['No training on your mail', 'Your email is never used to train models, never sold, never shared with anyone.'],
              ['Leave whenever', 'One button deletes every row and revokes access. No retention window, no support ticket.'],
            ].map(([title, body]) => (
              <div key={title} className="card card-pad">
                <div className="h3">{title}</div>
                <p className="small secondary mt-8">{body}</p>
              </div>
            ))}
          </div>

          <p className="small muted" style={{ marginTop: 24 }}>
            Full detail in the <Link href="/privacy">privacy policy</Link>.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------------- faq */}
      <section className="marketing-section band">
        <div className="marketing-wrap" style={{ maxWidth: 760 }}>
          <h2 className="section-title">Questions</h2>
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

      {/* --------------------------------------------------------------- cta */}
      <section className="marketing-section">
        <div className="marketing-wrap" style={{ textAlign: 'center' }}>
          <h2 className="section-title" style={{ marginInline: 'auto' }}>
            Find out what you’ve forgotten
          </h2>
          <p className="section-sub" style={{ marginInline: 'auto' }}>
            Most people are surprised by the first list. Takes about a minute to find out.
          </p>
          <div className="row gap-12" style={{ justifyContent: 'center', marginTop: 28 }}>
            <Link href="/login" className="btn btn-primary" style={{ textDecoration: 'none' }}>
              Continue with Google
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
