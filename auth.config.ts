import type { NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import { env } from "@/lib/env";

const useSecureCookies = process.env.NODE_ENV === "production";

// App-specific session cookie name. The default (`authjs.session-token`) is the
// same for every Auth.js app, so multiple projects served on the same origin
// (e.g. localhost:3000) clobber each other's sessions. A unique name keeps this
// app from ever picking up another project's cookie. NOTE: middleware.ts checks
// this same name, and changing it logs everyone out once.
export const SESSION_COOKIE_NAME = `${useSecureCookies ? "__Secure-" : ""}workos.session-token`;

export const authConfig = {
  // PrismaAdapter is built against an older @auth/core minor than next-auth uses
  // (Adapter shape is identical at runtime). Cast through Adapter to align.
  adapter: PrismaAdapter(prisma) as Adapter,
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      // Default redirect to home page after sign in
      return baseUrl;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
} satisfies NextAuthConfig;
