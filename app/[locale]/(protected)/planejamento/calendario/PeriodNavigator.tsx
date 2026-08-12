"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Dot } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatISODate, shiftWeek, shiftMonth, formatYearMonth } from "@/lib/dates";

/**
 * Navegação de período ÚNICA — anterior / hoje / próximo — para as duas visões.
 *
 * Antes eram dois controles: `WeekNavigator` (client, preservava os filtros) e
 * uns `<Link>` soltos dentro do page.tsx para o mês, que montavam a URL do zero
 * e portanto **descartavam time/projeto/pessoa/concluídas** a cada clique de mês.
 * Aqui a URL sempre parte dos parâmetros atuais: só a chave do período muda.
 */
export function PeriodNavigator({
  view,
  anchor,
  label,
}: {
  view: "week" | "month";
  /** Segunda-feira da semana, ou dia 1 do mês. */
  anchor: Date;
  /** Rótulo do período já formatado no servidor (respeita o locale). */
  label: string;
}) {
  const t = useTranslations("reportsCalendar.navigation");
  const searchParams = useSearchParams();

  const periodKey = view === "week" ? "week" : "month";

  const buildHref = (delta: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (delta === 0) {
      // "Hoje" = remover a âncora e deixar o servidor cair no período atual.
      params.delete(periodKey);
    } else if (view === "week") {
      params.set("week", formatISODate(shiftWeek(anchor, delta)));
    } else {
      params.set("month", formatYearMonth(shiftMonth(anchor, delta)));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  };

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors";

  return (
    <div className="flex items-center gap-1.5">
      <Link href={buildHref(-1)} aria-label={t(`previous.${view}`)} className={iconBtn} rel="prev">
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <Link
        href={buildHref(0)}
        aria-label={t("today")}
        title={t("today")}
        className={iconBtn}
        scroll={false}
      >
        <Dot className="h-6 w-6" />
      </Link>
      <Link href={buildHref(1)} aria-label={t(`next.${view}`)} className={iconBtn} rel="next">
        <ChevronRight className="h-4 w-4" />
      </Link>
      <span
        className="ml-2 whitespace-nowrap px-2 text-sm font-semibold capitalize tabular-nums text-foreground"
        aria-live="polite"
      >
        {label}
      </span>
    </div>
  );
}
