import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Inter, Space_Grotesk } from 'next/font/google';
import { connection } from 'next/server';

import { appUrl } from '@/lib/url';
import '@/styles/global.css';

// Space Grotesk for display: a grotesk with enough character to carry a headline
// on a dark ground, where a neutral face disappears. Inter for reading, because
// long text on dark needs a face that gets out of the way at low contrast.
// Self-hosted at build: the Google Fonts stylesheet was a render-blocking
// cross-origin request (~95 ms before first paint) and told Google every visit.
const display = Space_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-grotesk' });
const body = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex',
});

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
  colorScheme: 'dark',
  // Matches --bg-page, so the phone's status bar continues the page rather
  // than drawing a hard line above it.
  themeColor: '#08080c',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page must render per request: a prerendered page has no CSP nonce, so
  // strict-dynamic blocks all its scripts. /login shipped dead this way.
  await connection();
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
