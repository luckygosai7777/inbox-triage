import type { MetadataRoute } from 'next';

import { appUrl } from '@/lib/url';

/** The signed-in app must never be indexed; the marketing site should be. */
export default function robots(): MetadataRoute.Robots {
  const base = appUrl();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/app/', '/api/', '/auth/'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
