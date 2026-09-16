import type { Metadata, Viewport } from 'next';

import { appUrl } from '@/lib/url';
import '@/styles/global.css';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/*
          Space Grotesk for display: a grotesk with enough character to carry a
          headline on a dark ground, where a neutral face disappears. Inter for
          reading, because long text on dark needs a face that gets out of the
          way and stays legible at low contrast.
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
