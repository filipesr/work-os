/**
 * Single source of truth for route segments (without locale prefix) that require
 * an authenticated session. Used by `middleware.ts` to redirect anonymous users to
 * sign-in. Keep in sync with the `(protected)` route group — adding a top-level
 * protected segment means adding it here too.
 */
export const PROTECTED_PATHS = [
  "/dashboard",
  "/tasks",
  "/admin",
  "/reports",
  "/account",
  "/tv",
] as const;

/** True when `pathname` (locale already stripped) falls under a protected segment. */
export function isProtectedPath(pathnameWithoutLocale: string): boolean {
  return PROTECTED_PATHS.some((path) => pathnameWithoutLocale.startsWith(path));
}
