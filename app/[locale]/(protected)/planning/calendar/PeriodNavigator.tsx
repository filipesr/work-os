"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { navegacaoIniciou, navegacaoTerminou } from "@/lib/navigation-busy";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatISODate, shiftWeek, shiftMonth, formatYearMonth } from "@/lib/dates";
import { PeriodPicker } from "./PeriodPicker";
import { periodLabel } from "@/lib/calendar/period-label";
import { useLocale } from "next-intl";

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
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  // O rótulo do período de DESTINO, mostrado apagado enquanto a navegação acontece.
  //
  // Sem isto, sair de janeiro apagava "janeiro", girava, e só então aparecia "fevereiro" — a tela
  // passava a espera inteira sem dizer para onde estava indo. Trocar de cara e acender ao terminar
  // é a mesma informação, na ordem em que ela é útil.
  const [destino, setDestino] = useState<string | null>(null);

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
  const navegar = (e: React.MouseEvent<HTMLAnchorElement>, href: string, alvo: Date | null) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setDestino(alvo ? periodLabel(view, alvo, locale) : null);
    startTransition(() => router.push(href, { scroll: false }));
  };

  /**
   * A âncora do período vizinho, na mesma conta que monta o href.
   *
   * "Hoje" devolve `null` de propósito: qual é o período atual é pergunta do SERVIDOR — este
   * componente recebe `isCurrent` pronto justamente para não calcular `new Date()` aqui e divergir
   * perto da virada do dia. Naquele clique o rótulo antigo fica apagado até a resposta chegar, que
   * é menos informação, mas não é informação errada.
   *
   * Na TELA isso coincide com deslocar zero períodos (dá o próprio rótulo atual), então o `null`
   * não muda o que aparece — ele existe para que ninguém "conserte" isso adivinhando hoje aqui.
   */
  const alvoDe = (delta: number): Date | null =>
    delta === 0 ? null : view === "week" ? shiftWeek(anchor, delta) : shiftMonth(anchor, delta);

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
        onClick={(e) => navegar(e, buildHref(-1), alvoDe(-1))}
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
        <PeriodPicker
          view={view}
          anchor={anchor}
          // O destino só vale ENQUANTO carrega. Limpá-lo por efeito era frágil: numa navegação
          // servida do cache a transição nunca chega a ser "pendente", o efeito não roda, e o
          // destino ficaria colado por cima do período que a grade de fato mostra. Aqui, terminada
          // a navegação — por sucesso ou por erro —, quem manda é sempre o rótulo do servidor.
          label={isPending && destino ? destino : label}
          busy={isPending}
        />
      </span>

      <Link
        href={buildHref(1)}
        onClick={(e) => navegar(e, buildHref(1), alvoDe(1))}
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
          onClick={(e) => navegar(e, buildHref(0), alvoDe(0))}
          className="ml-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
          scroll={false}
        >
          {t("today")}
        </Link>
      )}
    </div>
  );
}
