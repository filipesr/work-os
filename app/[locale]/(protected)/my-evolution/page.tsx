import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TrendingUp } from "lucide-react";
import { PersonAnalytics } from "@/components/people/PersonAnalytics";
import { monthRangeSaoPaulo, currentMonthSaoPaulo } from "@/lib/dates";

export const metadata: Metadata = { title: "Minha Evolução" };

// Tela pessoal de evolução (§3): consolida o antigo widget do dashboard. Privada,
// auto-referenciada — nunca comparativa (P1/P2). Acessível a todos os papéis via
// o menu de avatar.
export default async function MinhaEvolucaoPage() {
  const session = await auth();
  if (!session?.user) return notFound();
  const userId = session.user.id as string;
  const t = await getTranslations("common.myEvolution");
  const { start, end } = monthRangeSaoPaulo(currentMonthSaoPaulo());

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="mb-1 inline-flex items-center gap-2 text-sm font-medium text-primary">
          <TrendingUp className="h-4 w-4" aria-hidden="true" />
          {t("title")}
        </div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {/* Mesmo componente que o gestor vê em /reports/user/[id] — sem o controle
          de reclassificar (a pessoa vê a classificação, não a edita: salvaguarda 4). */}
      <PersonAnalytics userId={userId} range={{ from: start, to: end }} />
    </div>
  );
}
