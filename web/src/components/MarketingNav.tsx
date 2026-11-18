import Link from 'next/link';

import { currentUser } from '@/lib/supabase';

import Logo from './Logo';
import StickyHeader from './public/StickyHeader';

/**
 * Public site header. Server component so it can show "Open app" to someone
 * already signed in, rather than sending them back through a login they do
 * not need.
 *
 * The mail intro measures the logo link (data-intro-logo) and draws its
 * letterhead there, so the letter turns into this header exactly.
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
    <StickyHeader>
      <div className="tw:mx-auto tw:flex tw:h-20 tw:max-w-6xl tw:items-center tw:gap-3 tw:px-6">
        <Link href="/" className="tw:rounded-md" data-intro-logo>
          <Logo size={34} withWordmark />
        </Link>

        <nav className="tw:ml-auto tw:flex tw:items-center tw:gap-5 tw:text-sm tw:sm:gap-7">
          <Link href="/pricing" className="tw:text-ink-soft tw:hover:text-accent">
            Pricing
          </Link>
          <Link href="/privacy" className="tw:hidden tw:text-ink-soft tw:hover:text-accent tw:sm:inline">
            Privacy
          </Link>
          {signedIn ? (
            <Link href="/app" className="btn">
              Open app
            </Link>
          ) : (
            <Link href="/login" className="btn btn-primary">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </StickyHeader>
  );
}
