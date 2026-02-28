import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { locales, defaultLocale } from "./lib/i18n";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
});

// Protected route patterns (without locale prefix)
const protectedPaths = ["/dashboard", "/tasks", "/admin", "/reports", "/account"];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Strip locale prefix to check against protected paths
  const pathnameWithoutLocale = locales.reduce(
    (path, locale) => path.replace(`/${locale}`, ""),
    pathname
  );

  // Check if it's a protected route
  const isProtectedRoute = protectedPaths.some((path) =>
    pathnameWithoutLocale.startsWith(path)
  );

  if (isProtectedRoute) {
    // Check for NextAuth session cookie (database sessions)
    const sessionCookie =
      request.cookies.get("authjs.session-token") ||
      request.cookies.get("__Secure-authjs.session-token");

    if (!sessionCookie) {
      const signInUrl = new URL("/auth/signin", request.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
