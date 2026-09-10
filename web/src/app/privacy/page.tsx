import type { Metadata } from 'next';
import Link from 'next/link';

import Footer from '@/components/Footer';
import MarketingNav from '@/components/MarketingNav';

export const metadata: Metadata = {
  title: 'Privacy Policy — Owed',
  description: 'What Owed reads, what it stores, and how to delete it.',
  robots: { index: true, follow: true },
};

/**
 * Required for Google OAuth verification of restricted scopes.
 *
 * The Limited Use section below is not optional wording — Google's reviewers
 * look for an affirmative statement that the app's use of data from Google APIs
 * adheres to the Limited Use requirements. Read this before publishing and
 * replace the placeholders marked TODO with your real entity details.
 */
export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <MarketingNav />

      <section className="marketing-section">
        <div className="prose">
          <h1>Privacy Policy</h1>
          <p className="muted small">Last updated: {new Date().toISOString().slice(0, 10)}</p>

          <div className="callout">
            <p>
              <strong>The short version.</strong> We read your Gmail and calendar to work out what
              you owe people and when you are free. We store the results against your account. We
              never send email as you, never sell your data, and never use it to train models. One
              button deletes all of it.
            </p>
          </div>

          <h2>1. Who we are</h2>
          <p>
            Owed (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides an email triage and
            commitment-tracking service. {/* TODO: replace with your legal entity and address */}
            <strong> TODO: add your legal entity name, registered address and contact email</strong>{' '}
            before publishing. Questions:{' '}
            <a href="mailto:privacy@example.com">privacy@example.com</a>{' '}
            <strong>(TODO: replace)</strong>.
          </p>

          <h2>2. What we access</h2>
          <p>When you connect your Google account, you grant these scopes:</p>
          <ul>
            <li>
              <strong>gmail.modify</strong> — read message headers and bodies, and archive threads
              you choose to archive. This scope permits sending, but{' '}
              <strong>the application contains no send capability</strong>; replies open a Gmail
              compose window for you to send yourself.
            </li>
            <li>
              <strong>calendar.readonly</strong> — read event times on your primary calendar to find
              the gaps between meetings. We read start and end times and titles. We never create,
              edit or delete events.
            </li>
            <li>
              <strong>email, profile, openid</strong> — your email address and name, to identify
              your account.
            </li>
          </ul>

          <h2>3. What we store</h2>
          <ul>
            <li>
              <strong>Message metadata and content</strong> — sender, recipients, subject, a short
              preview, and timestamps for recent messages, including sent mail. Body text is read
              during processing to find commitments and deadlines; the sentence a commitment came
              from is stored as evidence so you can verify it.
            </li>
            <li>
              <strong>Derived results</strong> — priority, category, estimated reply effort,
              extracted commitments and deadlines.
            </li>
            <li>
              <strong>Calendar busy blocks</strong> — start time, end time and title for the current
              day.
            </li>
            <li>
              <strong>Your Google refresh token</strong> — encrypted with AES-256-GCM before it is
              written to the database, so the database only ever holds ciphertext.
            </li>
          </ul>

          <h2>4. What we never do</h2>
          <ul>
            <li>We never send, forward or delete email on your behalf.</li>
            <li>We never sell, rent or trade your data.</li>
            <li>
              We never use your email content to train, retrain or fine-tune any machine learning
              model, ours or anyone else&rsquo;s.
            </li>
            <li>We never share your data for advertising.</li>
            <li>
              No human at Owed reads your mail, except where you explicitly ask us to
              investigate a problem and give permission for that specific case.
            </li>
          </ul>

          <h2>5. Limited Use disclosure</h2>
          <div className="callout">
            <p>
              Owed&rsquo;s use and transfer of information received from Google APIs adheres
              to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Specifically: we use Google user data only
              to provide and improve the user-facing features described in this policy; we do not
              transfer it to third parties except as necessary to provide those features, for
              security purposes, or to comply with applicable law; we do not use it for advertising;
              and we do not allow humans to read it unless we have your affirmative agreement for
              specific messages, it is necessary for security or to comply with applicable law, or
              the data is aggregated and anonymised.
            </p>
          </div>

          <h2>6. Sub-processors</h2>
          <p>We use a small number of providers to run the service:</p>
          <ul>
            <li>
              <strong>Supabase</strong> — database and authentication. Stores the data listed in
              section 3.
            </li>
            <li>
              <strong>Vercel</strong> — application hosting. Processes requests in transit.
            </li>
            <li>
              <strong>Anthropic</strong> — the model that classifies messages and extracts
              commitments. Message subjects, previews and body excerpts are sent for processing.
              Anthropic does not train on data submitted through its API.
            </li>
            <li>
              <strong>Google</strong> — the source of your mail and calendar data.
            </li>
          </ul>

          <h2>7. Security</h2>
          <ul>
            <li>Refresh tokens are encrypted with AES-256-GCM before storage.</li>
            <li>
              Row-level security is enforced in the database, so one account&rsquo;s data cannot be
              returned to another even in the event of an application bug.
            </li>
            <li>All traffic is served over TLS with HSTS.</li>
            <li>A strict Content Security Policy is applied to every response.</li>
          </ul>
          <p>
            No system is perfectly secure. If you discover a vulnerability, please report it to{' '}
            <a href="mailto:security@example.com">security@example.com</a>{' '}
            <strong>(TODO: replace)</strong> and we will respond promptly.
          </p>

          <h2>8. Retention</h2>
          <p>
            We keep your data while your account is open. Deleting your account removes every row we
            hold about you immediately, with no retention window. Message data older than 180 days
            is pruned automatically as part of normal operation.
          </p>

          <h2>9. Your rights</h2>
          <ul>
            <li>
              <strong>Access and export</strong> — download everything we hold from Settings.
            </li>
            <li>
              <strong>Deletion</strong> — Settings → Delete account removes all data and revokes our
              access to your Google account.
            </li>
            <li>
              <strong>Revoke access at Google</strong> — you can also remove our access at any time
              from{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                your Google account permissions page
              </a>
              .
            </li>
          </ul>
          <p>
            If you are in the UK, EU or another region with data protection rights, you may also
            request correction or restriction of processing, and may lodge a complaint with your
            local supervisory authority.
          </p>

          <h2>10. Cookies</h2>
          <p>
            We set one essential cookie to keep you signed in. We do not use advertising or
            third-party tracking cookies.
          </p>

          <h2>11. Children</h2>
          <p>The service is not directed at anyone under 16 and we do not knowingly collect their data.</p>

          <h2>12. Changes</h2>
          <p>
            If we change this policy materially we will notify you by email and in the app before the
            change takes effect.
          </p>

          <p style={{ marginTop: 40 }}>
            <Link href="/terms">Terms of Service</Link> · <Link href="/">Home</Link>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
