/**
 * Edge middleware: security headers, CSRF origin checks, and a cheap auth gate.
 *
 * DESIGN NOTE — why there is no Supabase SDK call here.
 *
 * The obvious implementation calls `supabase.auth.getUser()` in middleware to
 * decide whether someone is signed in. That is what the first version did, and
 * it was wrong twice over:
 *
 *   1. Middleware runs on EVERY request. A network round trip to Supabase on
 *      every page load, every asset, every robots.txt fetch is latency nobody
 *      asked for.
 *   2. Middleware failing takes down the whole site. When the Supabase
 *      credentials were first added, the SDK threw in the edge runtime and every
 *      route returned MIDDLEWARE_INVOCATION_FAILED — the landing page, the
 *      pricing page and the privacy policy included, none of which have anything
 *      to do with authentication.
 *
 * So middleware now only looks for the *presence* of a Supabase session cookie.
 * That is a fast, local, cannot-fail check, and it is enough to redirect an
 * obviously-signed-out visitor away from the app.
 *
 * This is NOT the security boundary. A forged cookie gets past this check and
 * then hits `currentUser()` in the page or route handler, which calls
 * `supabase.auth.getUser()` and cryptographically validates the JWT against
 * Supabase. Row Level Security is the layer under that. The middleware check is
 * a UX shortcut, not a lock.
 */
import { NextResponse, type NextRequest } from 'next/server';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const demoMode = () =>
  process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';

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
  const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
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
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('X-DNS-Prefetch-Control', 'off');

  if (process.env.NODE_ENV === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  return response;
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    // Same-origin fetches from older browsers may omit Origin; fall back to Referer.
    const referer = request.headers.get('referer');
    if (!referer) return false;
    try {
      return new URL(referer).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }
  const allowed = new Set([request.nextUrl.origin]);
  const configured = process.env.APP_URL?.trim();
  if (configured) allowed.add(configured.replace(/\/$/, ''));
  return allowed.has(origin);
}

/**
 * Does the request carry a Supabase session cookie?
 *
 * Supabase names them `sb-<project-ref>-auth-token`, and splits large ones into
 * `.0`, `.1` chunks. Matching on the shape rather than a hardcoded project ref
 * means this keeps working if the project changes.
 *
 * Presence only — the value is never trusted. Validation happens server-side.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name) && cookie.value.length > 0);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = pathname === '/app' || pathname.startsWith('/app/');

  // Demo mode: no auth at all, and /login is meaningless.
  if (demoMode()) {
    if (pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/app';
      url.search = '';
      return applySecurityHeaders(NextResponse.redirect(url));
    }
    return applySecurityHeaders(NextResponse.next());
  }

  // Cron routes are called by Vercel's scheduler, not a browser: no Origin
  // header and no session. They authenticate with a bearer secret instead.
  const isCron = pathname.startsWith('/api/cron/');

  // CSRF backstop. SameSite=Lax still permits top-level POST navigations, so
  // an Origin check is the thing that actually stops a cross-site form post.
  if (
    !isCron &&
    pathname.startsWith('/api/') &&
    MUTATING.has(request.method) &&
    !isSameOrigin(request)
  ) {
    return applySecurityHeaders(
      NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 }),
    );
  }

  // API routes answer with their own JSON 401; redirecting a fetch to an HTML
  // login page would just confuse the caller.
  if (isProtected) {
    const configured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
    );

    if (!configured || !hasSessionCookie(request)) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = configured ? `?next=${encodeURIComponent(pathname)}` : '?setup=1';
      return applySecurityHeaders(NextResponse.redirect(url));
    }
  }

  // Already signed in and asking for the login page: send them to the app.
  if (pathname === '/login' && hasSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = '/app';
    url.search = '';
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    // Everything except static assets and the favicon.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
