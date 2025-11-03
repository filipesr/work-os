import { auth, signIn, signOut } from "@/auth"
import { UserRole } from "@prisma/client"

/**
 * Get the current server-side session
 * Use this in Server Components, Server Actions, and Route Handlers
 */
export const getServerSession = auth

/**
 * Sign in a user
 */
export { signIn }

/**
 * Sign out a user
 */
export { signOut }

/**
 * Check if the current user has a specific role
 */
export async function hasRole(role: UserRole): Promise<boolean> {
  const session = await auth()
  if (!session?.user) return false
  // @ts-ignore - Custom session fields
  return session.user.role === role
}

/**
 * Check if the current user has one of the specified roles
 */
export async function hasAnyRole(roles: UserRole[]): Promise<boolean> {
  const session = await auth()
  if (!session?.user) return false
  // @ts-ignore - Custom session fields
  return roles.includes(session.user.role)
}

/**
 * Get the current user's role
 */
export async function getUserRole(): Promise<UserRole | null> {
  const session = await auth()
  if (!session?.user) return null
  // @ts-ignore - Custom session fields
  return session.user.role || null
}

/**
 * Get the current user's team ID
 */
export async function getUserTeamId(): Promise<string | null> {
  const session = await auth()
  if (!session?.user) return null
  // @ts-ignore - Custom session fields
  return session.user.teamId || null
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth() {
  const session = await auth()
  if (!session?.user) {
    throw new Error("Unauthorized")
  }
  return session
}

/**
 * Require a specific role - throws if not authorized
 */
export async function requireRole(role: UserRole) {
  const session = await requireAuth()
  // @ts-ignore - Custom session fields
  if (session.user.role !== role) {
    throw new Error(`Forbidden - requires ${role} role`)
  }
  return session
}

/**
 * Require one of the specified roles - throws if not authorized
 */
export async function requireAnyRole(roles: UserRole[]) {
  const session = await requireAuth()
  // @ts-ignore - Custom session fields
  if (!roles.includes(session.user.role)) {
    throw new Error(`Forbidden - requires one of: ${roles.join(", ")}`)
  }
  return session
}
