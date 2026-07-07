/**
 * RBAC (Role-Based Access Control) Utilities
 *
 * This module provides helper functions for enforcing role-based permissions
 * across the application. It ensures that users can only perform actions
 * that their role allows.
 */

import { cache } from "react";
import { auth } from "@/auth";
import { UserRole } from "@prisma/client";

/**
 * Get the currently authenticated user from the session.
 * Throws an error if the user is not authenticated.
 *
 * Wrapped in React `cache()` so the session lookup (`auth()` — cookie decrypt)
 * is deduped within a single server render/action, even though the many require*
 * helpers each call it. No cross-request leakage: `cache()` is per-request.
 */
export const getSessionUser = cache(async () => {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Not Authenticated");
  }
  return session.user;
});

/**
 * Check if the current user has one of the allowed roles.
 * Throws an error if the user doesn't have the required permission.
 *
 * @param allowedRoles - Array of roles that are allowed to perform the action
 * @returns The authenticated user if the check passes
 * @throws Error if the user doesn't have one of the allowed roles
 */
export const checkRole = async (allowedRoles: UserRole[]) => {
  const user = await getSessionUser();

  if (!allowedRoles.includes(user.role)) {
    throw new Error("Access Denied: Insufficient permissions.");
  }

  return user;
};

/**
 * Check if the current user is an Admin.
 * This is a convenience function for the most common permission check.
 */
export const requireAdmin = async () => {
  return checkRole([UserRole.ADMIN]);
};

/**
 * Check if the current user is a Manager or higher (Manager or Admin).
 */
export const requireManagerOrAdmin = async () => {
  return checkRole([UserRole.ADMIN, UserRole.MANAGER]);
};

/**
 * Check if the current user is a Supervisor or higher (Supervisor, Manager, or Admin).
 * Used e.g. for creating/revoking external share links of CLIENTE artifacts.
 */
export const requireSupervisorOrHigher = async () => {
  return checkRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR]);
};

/**
 * Check if the current user is a Member or higher (Member, Supervisor, Manager, or Admin).
 */
export const requireMemberOrHigher = async () => {
  return checkRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.MEMBER]);
};

/**
 * Get the user's role as a string (for conditional rendering in client components).
 * Returns null if the user is not authenticated.
 */
export const getUserRole = async (): Promise<UserRole | null> => {
  try {
    const user = await getSessionUser();
    return user.role;
  } catch {
    return null;
  }
};
