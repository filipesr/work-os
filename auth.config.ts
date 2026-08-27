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
      // Permite vincular a conta Google a um User que já existe com o mesmo e-mail.
      //
      // Sem isto, um User sem linha em `Account` é intransponível: o Auth.js recusa com
      // `OAuthAccountNotLinked` para impedir que alguém registre o e-mail de outra pessoa em outro
      // provedor e assuma a conta. Foi exatamente o que travou vários acessos quando o banco foi
      // perdido — os `User` voltaram, os `Account` não.
      //
      // O "dangerous" do nome é sobre DOIS cenários que aqui não existem: vários provedores (dá
      // para entrar por um provedor que não verifica e-mail e cair na conta de outro) e provedor
      // que não verifica posse do e-mail. Este app tem só Google, que verifica. O que resta é:
      // quem controla a conta Google daquele e-mail entra — que é a definição de dono do e-mail.
      //
      // Depende do `signIn` abaixo continuar restringindo QUEM entra: com cadastro aberto, isto
      // permitiria vincular-se a qualquer User existente. Os dois andam juntos.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    /**
     * Porta de entrada: só entra quem um admin já cadastrou, e que não esteja desativado.
     *
     * Antes disto não havia restrição alguma — qualquer conta Google do mundo que abrisse a URL
     * virava um usuário MEMBER criado pelo adapter. Desativar alguém não teria sentido enquanto a
     * porta ficasse destrancada: bastaria entrar de novo para renascer.
     *
     * Roda ANTES de o adapter criar qualquer coisa, então recusar aqui não deixa User órfão.
     * Devolver uma string redireciona — é o que permite a tela de login dizer QUAL foi o motivo,
     * em vez do `AccessDenied` genérico.
     */
    async signIn({ user, profile }) {
      const email = (user?.email ?? profile?.email)?.toLowerCase().trim();
      if (!email) return "/auth/signin?error=NoEmail";

      const existing = await prisma.user.findUnique({
        where: { email },
        select: { disabledAt: true },
      });
      if (!existing) return "/auth/signin?error=NotInvited";
      if (existing.disabledAt) return "/auth/signin?error=AccountDisabled";
      return true;
    },
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
