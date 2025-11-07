import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "./lib/i18n";

export default createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,

  // Use locale prefix as needed (default locale without prefix)
  localePrefix: "as-needed",
});

export const config = {
  // Match only internationalized pathnames
  matcher: [
    // Match all pathnames except for
    // - /api routes
    // - /_next (Next.js internals)
    // - /images, /fonts, etc. (static files)
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
