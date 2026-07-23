import type { Metadata } from "next";
import { AdminHealthSection } from "@/components/admin/AdminHealthSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Geral" };

// Cockpit de saúde do time (§3): guiado por exceção. Removidos os 5 contadores
// decorativos, o rail de navegação (nav agora é global) e o storage por cliente
// (vai para Clientes). Sobram os cards de saúde — o que é acionável. A carga ao
// vivo por time (CurrentLoadGrid, §3.1) foi trazida dos relatórios para o cockpit.
export default async function CockpitPage() {
  const t = await getTranslations("admin.geral");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")} />

      <AdminHealthSection />
    </div>
  );
}
