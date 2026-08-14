"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatISODate, formatYearMonth } from "@/lib/dates";
import { mondaysTouchingMonth } from "@/lib/calendar/planning-dates";

/**
 * Seletor de período, aberto pelo próprio rótulo da data.
 *
 * A navegação de setas resolve "o período vizinho"; não resolve "novembro", que
 * a três cliques de distância vira contagem. O rótulo já era o elemento que a
 * pessoa olha para saber onde está — torná-lo clicável usa o alvo que a atenção
 * já encontrou, em vez de acrescentar mais um botão à barra.
 *
 * O conteúdo muda com a tela: o mês oferece uma grade de 12 meses; a semana
 * oferece as semanas de um mês, porque escolher "a semana de 9 a 15" exige ver
 * os intervalos — uma lista de números de semana não diz nada a ninguém.
 */
export function PeriodPicker({
  view,
  anchor,
  label,
}: {
  view: "week" | "month";
  /** Segunda-feira da semana, ou dia 1 do mês. */
  anchor: Date;
  label: string;
}) {
  const t = useTranslations("reportsCalendar.navigation");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Mês em foco DENTRO do seletor. Começa no período atual e anda com as setas
  // do próprio diálogo, sem mexer na tela por trás — navegar para escolher não
  // deveria já mudar o que se está olhando.
  const [foco, setFoco] = useState(() => new Date(anchor.getTime()));

  const irPara = (chave: "week" | "month", valor: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("week");
    params.delete("month");
    params.set(chave, valor);
    setOpen(false);
    router.push(`?${params.toString()}`);
  };

  const mudarAnoFoco = (delta: number) =>
    setFoco((d) => new Date(Date.UTC(d.getUTCFullYear() + delta, d.getUTCMonth(), 1)));
  const mudarMesFoco = (delta: number) =>
    setFoco((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)));

  const ano = foco.getUTCFullYear();
  const mesAtual = anchor.getUTCMonth();
  const anoAtual = anchor.getUTCFullYear();

  const nomeMes = (m: number) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(ano, m, 1))
    );

  const intervaloSemana = (segundaIso: string) => {
    const seg = new Date(`${segundaIso}T00:00:00.000Z`);
    const dom = new Date(seg.getTime() + 6 * 8.64e7);
    const f = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", timeZone: "UTC" });
    return `${f.format(seg)} – ${f.format(dom)}`;
  };

  const opcao =
    "rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent";
  const opcaoAtual = "border-primary bg-primary text-primary-foreground hover:bg-primary";
  const setaFoco =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        // Reabrir sempre parte de onde a tela está, não de onde a última
        // navegação dentro do diálogo parou.
        if (v) setFoco(new Date(anchor.getTime()));
      }}
    >
      {/* Sem aria-label no gatilho: ele SUBSTITUIRIA o texto, e quem usa leitor
          de tela ouviria "escolher período" sem saber QUAL está aberto — que é a
          informação principal. O papel de botão já diz que é clicável; o título
          dá a dica de que abre o seletor. */}
      <DialogTrigger asChild>
        <button
          type="button"
          title={t("pick")}
          className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold capitalize tabular-nums text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {label}
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{t("pick")}</DialogTitle>
          <DialogDescription>{t(`pickHint.${view}`)}</DialogDescription>
        </DialogHeader>

        {/* Navegação do FOCO do diálogo: ano na visão de mês, mês na de semana. */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => (view === "month" ? mudarAnoFoco(-1) : mudarMesFoco(-1))}
            className={setaFoco}
            aria-label={t("previous.month")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold capitalize tabular-nums text-foreground">
            {view === "month"
              ? ano
              : new Intl.DateTimeFormat(locale, {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(foco)}
          </span>
          <button
            type="button"
            onClick={() => (view === "month" ? mudarAnoFoco(1) : mudarMesFoco(1))}
            className={setaFoco}
            aria-label={t("next.month")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {view === "month" ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }).map((_, m) => {
              const atual = m === mesAtual && ano === anoAtual;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => irPara("month", formatYearMonth(new Date(Date.UTC(ano, m, 1))))}
                  aria-current={atual ? "true" : undefined}
                  className={`${opcao} capitalize ${atual ? opcaoAtual : ""}`}
                >
                  {nomeMes(m)}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1.5">
            {mondaysTouchingMonth(foco.getUTCFullYear(), foco.getUTCMonth()).map((iso) => {
              const atual = iso === formatISODate(anchor);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => irPara("week", iso)}
                  aria-current={atual ? "true" : undefined}
                  className={`${opcao} block w-full text-left ${atual ? opcaoAtual : ""}`}
                >
                  {intervaloSemana(iso)}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
