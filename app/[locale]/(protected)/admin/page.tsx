import type { Metadata } from "next";
import { AdminHealthSection } from "@/components/admin/AdminHealthSection";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Geral" };

// Cockpit de saúde do time (§3): guiado por exceção. Removidos os 5 contadores
// decorativos, o rail de navegação (nav agora é global) e o storage por cliente
// (vai para Clientes). Sobram os cards de saúde — o que é acionável.
export default async function CockpitPage() {
  const t = await getTranslations("admin.geral");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="mb-1 text-sm font-medium text-primary">{t("kicker")}</div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <AdminHealthSection />
    </div>
  );
}
