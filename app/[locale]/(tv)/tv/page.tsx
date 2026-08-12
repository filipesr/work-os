import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { env } from "@/lib/env";
import {
  WALLBOARD_COOKIE,
  WALLBOARD_COOKIE_MAX_AGE,
  verifyWallboardToken,
} from "@/lib/tv-wallboard";
import { TVBoard } from "./TVBoard";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Modo TV: wallboard de parede do quadro de presença. Mesma feature do board
 * (`/reports/live-activity`) — mesma fonte de dados, mesmo stream, mesmo card —
 * numa rota separada só para herdar o layout `(tv)`, que não tem navegação.
 *
 * Autenticação em dois caminhos (ver lib/presence-access.ts):
 *  1. **Conta de serviço**: abre-se uma vez com `/tv?token=<TV_WALLBOARD_TOKEN>`;
 *     o token é trocado por um cookie httpOnly de 1 ano e a URL é limpa por
 *     redirect — o segredo sai do histórico, do referrer e dos logs de acesso.
 *  2. **Humano**: MANAGER/ADMIN logado, para conferir o mural sem token.
 *
 * Sem nenhum dos dois → vai para o login. Nunca aberta: se
 * `TV_WALLBOARD_TOKEN` não estiver configurado, `verifyWallboardToken` devolve
 * false e sobra apenas o caminho 2.
 */
export default async function TVPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const jar = await cookies();

  // Troca token→cookie e limpa a URL. Feito antes de qualquer leitura de dados.
  if (token && verifyWallboardToken(token, env.TV_WALLBOARD_TOKEN)) {
    jar.set(WALLBOARD_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: WALLBOARD_COOKIE_MAX_AGE,
    });
    redirect("/tv");
  }

  const hasWallboardCookie = verifyWallboardToken(
    jar.get(WALLBOARD_COOKIE)?.value,
    env.TV_WALLBOARD_TOKEN
  );

  if (!hasWallboardCookie) {
    // Fallback humano. `requireManagerOrAdmin` alinha a TV à barra do board —
    // antes ela pedia só `requireMemberOrHigher` e virava um contorno.
    try {
      await requireManagerOrAdmin();
    } catch {
      redirect("/auth/signin");
    }
  }

  const t = await getTranslations("reports.liveActivity");

  return (
    <TVBoard
      labels={{
        online: t("online"),
        working: t("working"),
        total: t("tv.total"),
        notSurveillance: t("notSurveillance"),
      }}
    />
  );
}
