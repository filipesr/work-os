"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays, CalendarRange } from "lucide-react";

type View = "week" | "month";

/**
 * Alternância semana/mês. As visões são telas separadas, então isto navega entre
 * ROTAS — não troca mais um `?view=`.
 *
 * Preserva os filtros e o modo planejamento ao atravessar: os dois links já
 * apontaram para a rota pura, e trocar de visão **zerava
 * time/projeto/pessoa/concluídas** — o gestor filtrava a semana, clicava em
 * "Mês" e perdia tudo. Só a âncora de período é descartada, porque `week=` e
 * `month=` não se traduzem entre si.
 */
export function CalendarViewToggle({ view }: { view: View }) {
  const t = useTranslations("reportsCalendar.view");
  const searchParams = useSearchParams();

  const hrefFor = (target: View) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("week");
    params.delete("month");
    // `view` já não é parâmetro; some se vier de um link antigo.
    params.delete("view");
    const qs = params.toString();
    return `/planning/calendar/${target}${qs ? `?${qs}` : ""}`;
  };

  const base =
    "inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const active = "bg-primary text-primary-foreground";
  const inactive = "bg-card text-muted-foreground hover:bg-accent";

  return (
    <div
      className="inline-flex overflow-hidden rounded-lg border border-border"
      role="tablist"
      aria-label={t("label")}
    >
      <Link
        href={hrefFor("week")}
        role="tab"
        aria-selected={view === "week"}
        className={`${base} ${view === "week" ? active : inactive}`}
      >
        <CalendarDays className="h-4 w-4" />
        {t("week")}
      </Link>
      <Link
        href={hrefFor("month")}
        role="tab"
        aria-selected={view === "month"}
        className={`${base} border-l border-border ${view === "month" ? active : inactive}`}
      >
        <CalendarRange className="h-4 w-4" />
        {t("month")}
      </Link>
    </div>
  );
}
