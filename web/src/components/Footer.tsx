import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-col" style={{ maxWidth: 300 }}>
          <Link href="/" className="brand" style={{ marginBottom: 4 }}>
            <span className="brand-mark">O</span>
            Owed
          </Link>
          <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
            The to-do list you never had to write. Built from the promises already sitting in your
            sent folder.
          </p>
        </div>

        <div className="footer-col">
          <span className="label">Product</span>
          <Link href="/pricing">Pricing</Link>
          <Link href="/login">Sign in</Link>
        </div>

        <div className="footer-col">
          <span className="label">Legal</span>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms of service</Link>
        </div>
      </div>

      <div
        className="footer-grid"
        style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border-light)' }}
      >
        <span className="tiny muted">© {year} Owed. All rights reserved.</span>
        <span className="tiny muted">
          Use of Google data follows the Google API Services User Data Policy, including the
          Limited Use requirements.
        </span>
      </div>
    </footer>
  );
}
