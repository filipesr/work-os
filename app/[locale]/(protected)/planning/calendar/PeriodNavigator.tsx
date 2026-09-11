"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { navegacaoIniciou, navegacaoTerminou } from "@/lib/navigation-busy";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatISODate, shiftWeek, shiftMonth, formatYearMonth } from "@/lib/dates";
import { PeriodPicker } from "./PeriodPicker";

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
  isCurrent,
}: {
  view: "week" | "month";
  /** Segunda-feira da semana, ou dia 1 do mês. */
  anchor: Date;
  /** Rótulo do período já formatado no servidor (respeita o locale). */
  label: string;
  /** Se o período em tela é o de hoje. Vem do SERVIDOR: calcular `new Date()`
   *  aqui divergiria entre render de servidor e de cliente perto da virada do
   *  dia, e hidratação com valor diferente é erro silencioso. */
  isCurrent: boolean;
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

  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isPending) return;
    navegacaoIniciou();
    return () => navegacaoTerminou();
  }, [isPending]);

  /**
   * Navega dentro de uma TRANSIÇÃO, mantendo o `<Link>` por baixo.
   *
   * Trocar de período muda só o parâmetro, não a rota — o `loading.tsx` não dispara e, sem
   * transição, a grade antiga fica intacta por mais de um segundo. Clicar duas vezes na seta
   * avançava DOIS períodos sem que o primeiro tivesse aparecido.
   *
   * Clique com Ctrl/Cmd/Shift ou do meio segue para o navegador: abrir o mês seguinte em outra aba
   * continua funcionando.
   */
  const navegar = (e: React.MouseEvent<HTMLAnchorElement>, destino: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    startTransition(() => router.push(destino, { scroll: false }));
  };

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors";

  // "Hoje" só aparece quando LEVA a algum lugar. Sempre visível, seria mais um
  // botão a ignorar; aparecendo só fora do período atual, a própria presença já
  // informa que você navegou para longe.
  const foraDeHoje = !isCurrent;

  return (
    <div className="flex items-center gap-1">
      <Link
        href={buildHref(-1)}
        onClick={(e) => navegar(e, buildHref(-1))}
        aria-label={t(`previous.${view}`)}
        aria-busy={isPending}
        className={iconBtn}
        rel="prev"
      >
        <ChevronLeft className={`h-4 w-4 ${isPending ? "animate-pulse" : ""}`} />
      </Link>

      {/* O rótulo ENTRE as setas: é o padrão que a pessoa já leu em todo
          calendário, e vira o alvo do seletor sem custar um botão a mais. */}
      <span aria-live="polite">
        <PeriodPicker view={view} anchor={anchor} label={label} />
      </span>

      <Link
        href={buildHref(1)}
        onClick={(e) => navegar(e, buildHref(1))}
        aria-label={t(`next.${view}`)}
        aria-busy={isPending}
        className={iconBtn}
        rel="next"
      >
        <ChevronRight className={`h-4 w-4 ${isPending ? "animate-pulse" : ""}`} />
      </Link>

      {foraDeHoje && (
        <Link
          href={buildHref(0)}
          onClick={(e) => navegar(e, buildHref(0))}
          className="ml-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
          scroll={false}
        >
          {t("today")}
        </Link>
      )}
    </div>
  );
}
