"use server"

import { signOut as nextAuthSignOut } from "@/auth"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"

export async function signOutAction() {
  try {
    // Reset lastSeenAt to NULL on logout to mark user as explicitly offline
    const session = await auth()
    if (session?.user?.id) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { lastSeenAt: null }
      })
    }
  } catch (error) {
    console.error("Failed to reset lastSeenAt on logout:", error)
    // Continue with logout even if update fails
  }

  await nextAuthSignOut({ redirectTo: "/auth/signin" })
}