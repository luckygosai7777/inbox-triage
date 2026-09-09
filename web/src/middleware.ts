/**
 * Edge middleware: security headers, auth session refresh, and origin checks.
 *
 * This runs before every request. Three jobs:
 *
 *  1. Security headers on every response — CSP, HSTS, frame denial, etc. Doing
 *     it here rather than per-route means a new page cannot forget them.
 *  2. Refreshing the Supabase session cookie, so a logged-in user is not thrown
 *     out when their access token expires mid-session.
 *  3. Rejecting cross-origin state-changing requests. Supabase auth uses cookies,
 *     and a SameSite=Lax cookie is still sent on top-level POST navigations, so
 *     an Origin check is the backstop against CSRF.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** What Supabase hands back to `setAll`. */
type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };


/**
 * Content Security Policy.
 *
 * 'unsafe-inline' is present for styles only: the app uses inline style
 * attributes for values computed at render time (capacity bar widths, priority
 * colours). Script has no 'unsafe-inline' — a reflected XSS payload cannot
 * execute. connect-src is limited to self plus Supabase, so an injected script
 * could not exfiltrate to an attacker's host even if one ran.
 */
function contentSecurityPolicy(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseWs = supabase.replace(/^https/, 'wss');
  const dev = process.env.NODE_ENV !== 'production';

  return [
    "default-src 'self'",
    // Next.js injects a small inline bootstrap; in production it is hashed by
    // the framework, in dev it needs eval for fast refresh.
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    `connect-src 'self' ${supabase} ${supabaseWs}`.trim(),
    "frame-ancestors 'none'",
    "form-action 'self' https://accounts.google.com",
    "base-uri 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  const headers = response.headers;
  headers.set('Content-Security-Policy', contentSecurityPolicy());
  // Clickjacking: the app is never legitimately framed.
  headers.set('X-Frame-Options', 'DENY');
  // Stop browsers guessing a different content type than we declared.
  headers.set('X-Content-Type-Options', 'nosniff');
  // Do not leak the path a user came from to third parties.
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Nothing here needs these capabilities.
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );
  // Isolate the browsing context from cross-origin popups it opens.
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('X-DNS-Prefetch-Control', 'off');

  if (process.env.NODE_ENV === 'production') {
    // Two years, subdomains included. Only in production — sending HSTS from
    // localhost would pin http://localhost to https for the developer.
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  return response;
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  // Same-origin fetches from older browsers may omit Origin; fall back to Referer.
  if (!origin) {
    const referer = request.headers.get('referer');
    if (!referer) return false;
    try {
      return new URL(referer).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }
  const allowed = new Set([request.nextUrl.origin]);
  if (process.env.APP_URL) allowed.add(process.env.APP_URL.replace(/\/$/, ''));
  return allowed.has(origin);
}

const demoMode = () =>
  process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';

/**
 * Has Supabase been set up yet?
 *
 * A brand-new deploy has no database. The marketing site, pricing and legal
 * pages must still render — Google's OAuth review has to be able to read the
 * privacy policy before you have finished wiring anything up. So when the
 * project is unconfigured we treat every visitor as signed out rather than
 * crashing the whole site trying to build a client with empty credentials.
 */
const supabaseReady = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Demo mode: no Supabase, so no session to refresh and no gate to apply.
  // Security headers still go on every response.
  if (demoMode()) {
    if (pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/app';
      url.search = '';
      return applySecurityHeaders(NextResponse.redirect(url));
    }
    return applySecurityHeaders(NextResponse.next({ request }));
  }

  // Cron routes are called by Vercel's scheduler, not a browser: no Origin
  // header and no session. They authenticate with a bearer secret instead.
  const isCron = pathname.startsWith('/api/cron/');

  // CSRF backstop for state-changing API calls.
  if (!isCron && pathname.startsWith('/api/') && MUTATING.has(request.method) && !isSameOrigin(request)) {
    return applySecurityHeaders(
      NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 }),
    );
  }

  // Not connected to a database yet: public pages work, the app sends you to
  // the login screen, which explains what is still missing.
  if (!supabaseReady()) {
    if (pathname === '/app' || pathname.startsWith('/app/')) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '?setup=1';
      return applySecurityHeaders(NextResponse.redirect(url));
    }
    return applySecurityHeaders(NextResponse.next({ request }));
  }

  let response = NextResponse.next({ request });

  // Refresh the Supabase session and propagate any rotated cookies.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies: CookieToSet[]) => {
          cookies.forEach(({ name, value }: CookieToSet) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }: CookieToSet) =>
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              path: '/',
            }),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only the signed-in app is gated. The marketing site, legal pages and
  // login must stay public — Google's OAuth review has to reach them, and
  // they need to be indexable. API routes answer with JSON 401 themselves,
  // so they are excluded to avoid returning an HTML redirect to a fetch.
  const isProtected = pathname === '/app' || pathname.startsWith('/app/');
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return applySecurityHeaders(NextResponse.redirect(url));
  }
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/app';
    url.search = '';
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    // Everything except static assets and the favicon.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
