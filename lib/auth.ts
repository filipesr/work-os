import { auth as nextAuth, signIn, signOut } from "@/auth";

/**
 * NextAuth re-exports. This module is intentionally thin — todas as checagens
 * de RBAC (require*, hasRole, getUserRole, getUserTeamIds) vivem em
 * `@/lib/permissions`, que deduplica o lookup de sessão via React `cache()`.
 */

/**
 * Get the current server-side session.
 * Use this in Server Components, Server Actions, and Route Handlers.
 */
export const getServerSession = nextAuth;

/**
 * Export auth directly for common usage.
 */
export const auth = nextAuth;

export { signIn, signOut };
