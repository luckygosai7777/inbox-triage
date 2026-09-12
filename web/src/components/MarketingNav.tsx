import Link from 'next/link';

import { currentUser } from '@/lib/supabase';

import Logo from './Logo';

/**
 * Public site header. Server component so it can show "Open app" to someone
 * already signed in, rather than sending them back through a login they do
 * not need.
 */
export default async function MarketingNav() {
  let signedIn = false;
  try {
    signedIn = Boolean(await currentUser());
  } catch {
    // Marketing pages must render even with no Supabase configured.
    signedIn = false;
  }

  return (
    <header className="marketing-nav">
      <Link href="/" className="brand">
        <Logo size={24} />
        Owed
      </Link>

      <div className="spacer" />

      <nav className="nav-links">
        <Link href="/pricing" className="nav-link">
          Pricing
        </Link>
        <Link href="/privacy" className="nav-link hide-sm">
          Privacy
        </Link>
        {signedIn ? (
          <Link href="/app" className="btn btn-sm" style={{ textDecoration: 'none' }}>
            Open app
          </Link>
        ) : (
          <Link href="/login" className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
