"use client";

import { useTranslations } from "next-intl";
import { Lock, Unlock } from "lucide-react";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";

/**
 * Trava de escrita do calendário: sem ela ligada, a tela é SÓ LEITURA.
 *
 * O calendário mistura duas naturezas — ler a semana e **reagendar** entregas de
 * cliente. Arrastar é um gesto barato demais para uma ação que muda um
 * compromisso externo, e num grid denso um arraste acidental passa despercebido.
 * O modo explícito separa as duas coisas: quem só está olhando não consegue
 * mover nada por acidente.
 *
 * Vive na URL (`?plan=1`) e não em estado local de propósito — sobrevive à
 * navegação de período e à troca semana/mês, então o gestor liga uma vez e
 * planeja a rodada inteira sem religar a cada clique.
 */
export function PlanningModeToggle({ enabled }: { enabled: boolean }) {
  const t = useTranslations("reportsCalendar.planning");
  const { setParam } = useUrlFilters({ replace: true });

  return (
    <button
      type="button"
      onClick={() => setParam("plan", enabled ? null : "1")}
      aria-pressed={enabled}
      title={enabled ? t("disableHint") : t("enableHint")}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        enabled
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent"
      }`}
    >
      {enabled ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      {t("toggle")}
    </button>
  );
}
