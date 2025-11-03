import { UserRole } from "@prisma/client"
import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
  /**
   * Returned by `auth`, `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      id: string
      role: UserRole
      teamId: string | null
    } & DefaultSession["user"]
  }

  interface User {
    role: UserRole
    teamId: string | null
  }
}
