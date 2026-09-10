import type { Metadata } from 'next';
import Link from 'next/link';

import Footer from '@/components/Footer';
import MarketingNav from '@/components/MarketingNav';

export const metadata: Metadata = {
  title: 'Terms of Service — Owed',
  description: 'The agreement between you and Owed.',
  robots: { index: true, follow: true },
};

/**
 * Required alongside the privacy policy for Google OAuth verification.
 *
 * This is a reasonable starting draft, not legal advice. Have a lawyer review
 * it before you take payment or operate in a regulated market.
 */
export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <MarketingNav />

      <section className="marketing-section">
        <div className="prose">
          <h1>Terms of Service</h1>
          <p className="muted small">Last updated: {new Date().toISOString().slice(0, 10)}</p>

          <div className="callout">
            <p>
              <strong>Not legal advice.</strong> This is a working draft written for a product in
              development. Have it reviewed by a qualified lawyer before you charge money or launch
              publicly.
            </p>
          </div>

          <h2>1. Agreement</h2>
          <p>
            By using Owed (&ldquo;the Service&rdquo;) you agree to these terms. If you do not
            agree, do not use the Service. If you use it on behalf of an organisation, you confirm
            you have authority to bind that organisation.
          </p>

          <h2>2. What the Service does</h2>
          <p>
            The Service connects to your Google account to read mail and calendar data, and presents
            derived information: triaged mail, extracted commitments, and a suggested reply
            schedule. It is an assistive tool. It does not send email on your behalf.
          </p>

          <h2>3. Your account</h2>
          <ul>
            <li>You must be at least 16 years old.</li>
            <li>
              You are responsible for activity under your account and for the security of the Google
              account used to sign in.
            </li>
            <li>
              You must not use the Service to send bulk unsolicited mail, or in a way that breaches
              Google&rsquo;s terms, anti-spam law (including CAN-SPAM, GDPR and PECR where
              applicable), or any other law.
            </li>
          </ul>

          <h2>4. Accuracy, and what you must not rely on</h2>
          <div className="callout">
            <p>
              The Service uses automated analysis, including large language models, to identify
              commitments, deadlines and priorities. <strong>It will sometimes be wrong.</strong> It
              may miss a promise you made, surface something you never committed to, or misjudge
              urgency. You remain solely responsible for your own obligations and deadlines. Do not
              use the Service as your only record of anything that matters.
            </p>
          </div>
          <p>
            Where a deadline cannot be confirmed by date parsing, the Service says so rather than
            asserting a date. That is a design choice to reduce, not eliminate, the risk of relying
            on a wrong answer.
          </p>

          <h2>5. Acceptable use</h2>
          <p>You must not:</p>
          <ul>
            <li>Attempt to access another user&rsquo;s data.</li>
            <li>Probe, scan or test the security of the Service without written permission.</li>
            <li>Reverse engineer, scrape, or resell the Service.</li>
            <li>Use the Service to harass anyone or to send deceptive mail.</li>
            <li>Circumvent rate limits or usage quotas.</li>
          </ul>

          <h2>6. Plans and payment</h2>
          <p>
            A free plan is available with usage limits. Paid plans are billed in advance on the cycle
            shown at checkout and renew automatically until cancelled. You may cancel at any time and
            will retain access until the end of the paid period. Fees already paid are
            non-refundable except where required by law.
          </p>

          <h2>7. Third-party services</h2>
          <p>
            The Service depends on Google APIs and other providers listed in the{' '}
            <Link href="/privacy">privacy policy</Link>. Their availability is outside our control,
            and their own terms apply to your use of them.
          </p>

          <h2>8. Availability</h2>
          <p>
            The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis.
            We do not guarantee uninterrupted operation and may modify or discontinue features. We
            will give reasonable notice before discontinuing the Service entirely.
          </p>

          <h2>9. Disclaimer</h2>
          <p>
            To the maximum extent permitted by law, we disclaim all warranties, express or implied,
            including merchantability, fitness for a particular purpose and non-infringement.
          </p>

          <h2>10. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, we are not liable for indirect, incidental,
            special or consequential damages, or for lost profits, missed deadlines, lost business or
            lost data arising from your use of the Service. Our total aggregate liability is limited
            to the greater of the amount you paid us in the twelve months before the claim, or fifty
            US dollars. Nothing here limits liability that cannot lawfully be limited.
          </p>

          <h2>11. Termination</h2>
          <p>
            You may stop using the Service and delete your account at any time from Settings. We may
            suspend or terminate an account that breaches these terms, and will normally give notice
            unless doing so would create a security or legal risk.
          </p>

          <h2>12. Changes</h2>
          <p>
            We may update these terms. Material changes will be notified by email and in the app
            before taking effect. Continuing to use the Service after that constitutes acceptance.
          </p>

          <h2>13. Governing law</h2>
          <p>
            {/* TODO: set your jurisdiction */}
            <strong>TODO: insert governing jurisdiction</strong> — for example &ldquo;These terms are
            governed by the laws of England and Wales, and disputes are subject to the exclusive
            jurisdiction of its courts.&rdquo;
          </p>

          <h2>14. Contact</h2>
          <p>
            <a href="mailto:legal@example.com">legal@example.com</a>{' '}
            <strong>(TODO: replace)</strong>
          </p>

          <p style={{ marginTop: 40 }}>
            <Link href="/privacy">Privacy Policy</Link> · <Link href="/">Home</Link>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
