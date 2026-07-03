import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { locales, defaultLocale } from "./lib/i18n";
import { isProtectedPath } from "./lib/routes";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
  // App-specific name so the chosen language doesn't bleed across projects that
  // share localhost:3000 (next-intl's default is the shared `NEXT_LOCALE`).
  localeCookie: { name: "workos.NEXT_LOCALE", sameSite: "lax" },
});

/**
 * Builds a per-request Content-Security-Policy. Scripts are gated by a fresh
 * nonce + 'strict-dynamic' (no 'unsafe-inline'): Next.js automatically stamps
 * the nonce onto its own bundle scripts when it sees this CSP on the request
 * headers, and scripts loaded by those propagate trust via strict-dynamic.
 * 'unsafe-eval' is kept in development only (React Refresh / Turbopack need it).
 * style-src keeps 'unsafe-inline' because Next/Tailwind inject inline styles;
 * a present nonce makes browsers ignore 'unsafe-inline' for scripts anyway.
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  // NAS agent (LAN) — the browser talks directly to it for the health probe and the direct upload
  // PUT, so its origin must be allowed in connect-src. Public, non-secret; empty when unconfigured.
  // (Internal/share downloads are 302 navigations, not connect-src, so only the LAN origin is needed.)
  const nasLan = process.env.NEXT_PUBLIC_NAS_AGENT_URL_LAN?.replace(/\/+$/, "") ?? "";
  const connectSrc = ["'self'", nasLan].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://lh3.googleusercontent.com",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Strip locale prefix to check against protected paths
  const pathnameWithoutLocale = locales.reduce(
    (path, locale) => path.replace(`/${locale}`, ""),
    pathname
  );

  if (isProtectedPath(pathnameWithoutLocale)) {
    // Check for the app-specific session cookie (database sessions). The name is
    // unique to this app (see SESSION_COOKIE_NAME in auth.config.ts) so a stale
    // cookie from another project served on the same origin is ignored.
    const sessionCookie =
      request.cookies.get("workos.session-token") ||
      request.cookies.get("__Secure-workos.session-token");

    if (!sessionCookie) {
      const signInUrl = new URL("/auth/signin", request.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  // Per-request nonce + CSP. Inject into the request headers so next-intl
  // forwards them to the renderer (its next()/rewrite copies request.headers),
  // which is how Next.js picks up the nonce for its own scripts.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const intlRequest = new NextRequest(request, { headers: requestHeaders });
  const response = intlMiddleware(intlRequest);

  // Enforce on the response for the browser as well.
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
