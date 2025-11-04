import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/prisma"

export const authConfig = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    // Add more providers here as needed
  ],
  callbacks: {
    async session({ session, user }) {
      // Include user id, role, and teamId in the session
      if (session.user) {
        session.user.id = user.id
        // @ts-ignore - We're adding custom fields to the session
        session.user.role = user.role
        // @ts-ignore - We're adding custom fields to the session
        session.user.teamId = user.teamId
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url
      // Default redirect to home page after sign in
      return baseUrl
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
} satisfies NextAuthConfig
