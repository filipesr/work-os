import { auth as nextAuth, signIn, signOut } from "@/auth";
import { UserRole } from "@prisma/client";
import prisma from "@/lib/prisma";

/**
 * Get the current server-side session
 * Use this in Server Components, Server Actions, and Route Handlers
 */
export const getServerSession = nextAuth;

/**
 * Export auth directly for common usage
 */
export const auth = nextAuth;

/**
 * Sign in a user
 */
export { signIn };

/**
 * Sign out a user
 */
export { signOut };

export async function hasRole(role: UserRole): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  return session.user.role === role;
}

export async function hasAnyRole(roles: UserRole[]): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  return roles.includes(session.user.role);
}

export async function getUserRole(): Promise<UserRole | null> {
  const session = await auth();
  if (!session?.user) return null;
  return session.user.role || null;
}

export async function getUserTeamIds(): Promise<string[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teams: { select: { id: true } } },
  });
  return user?.teams.map((t) => t.id) ?? [];
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireRole(role: UserRole) {
  const session = await requireAuth();
  if (session.user.role !== role) {
    throw new Error(`Forbidden - requires ${role} role`);
  }
  return session;
}

export async function requireAnyRole(roles: UserRole[]) {
  const session = await requireAuth();
  if (!roles.includes(session.user.role)) {
    throw new Error(`Forbidden - requires one of: ${roles.join(", ")}`);
  }
  return session;
}
