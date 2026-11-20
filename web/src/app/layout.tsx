import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4, Space_Grotesk } from 'next/font/google';
import { connection } from 'next/server';

import { appUrl } from '@/lib/url';
import '@/styles/index.css';

// Source Serif for headings and IBM Plex Sans for reading: a book serif and a
// plain sans suit a product about letters on paper. Plex Mono is kept for the
// words a user wrote, quoted back to them. Space Grotesk is the wordmark only.
// Self-hosted at build: the Google Fonts stylesheet was a render-blocking
// cross-origin request (~95 ms before first paint) and told Google every visit.
const serif = Source_Serif_4({ subsets: ['latin'], display: 'swap', variable: '--font-source-serif' });
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-sans',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex',
});
const wordmark = Space_Grotesk({ subsets: ['latin'], weight: ['600'], display: 'swap', variable: '--font-grotesk' });

export const metadata: Metadata = {
  // Makes every relative URL in page metadata resolve against the real host.
  metadataBase: new URL(appUrl()),
  title: 'Owed',
  description: 'Know what you owe, to whom, by when — and whether today has room for it.',
  // The app is behind auth and has nothing to gain from indexing.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Without this, env(safe-area-inset-*) is always 0 and the bottom tab bar
  // sits under the iPhone home indicator.
  viewportFit: 'cover',
  colorScheme: 'light',
  // Matches --bg-page, so the phone's status bar continues the page rather
  // than drawing a hard line above it.
  themeColor: '#f3ece0',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page must render per request: a prerendered page has no CSP nonce, so
  // strict-dynamic blocks all its scripts. /login shipped dead this way.
  await connection();
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable} ${wordmark.variable}`}
      // Paper's inline script marks <html> (data-js, data-intro) before React hydrates.
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
