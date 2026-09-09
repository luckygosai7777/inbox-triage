import type { MetadataRoute } from 'next';

/** The signed-in app must never be indexed; the marketing site should be. */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/app/', '/api/', '/auth/'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
