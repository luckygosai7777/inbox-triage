import { IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google';

// The paper theme's faces: Source Serif for headings, IBM Plex Sans for reading. Self-hosted at
// build like the root layout's fonts, but loaded here so only the public pages preload them.
// Space Grotesk (root layout) stays the wordmark's face.
export const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-sans',
});

export const serif = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-source-serif',
});
