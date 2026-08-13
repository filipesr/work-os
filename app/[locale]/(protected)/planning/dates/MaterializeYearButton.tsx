"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import { materializeCatalogYear } from "@/lib/actions/calendar-occurrence";

/**
 * Gera as datas do catálogo (feriados e datas comerciais) para um ano.
 *
 * Existe porque parte do catálogo é MÓVEL — Páscoa por computus, Carnaval e
 * Corpus Christi derivados dela, Dia das Mães como 2º domingo de maio. Não dá
 * para "cadastrar 2027 uma vez"; é cálculo por ano.
 *
 * Idempotente: rodar de novo atualiza no lugar e **não encosta** nas datas
 * cadastradas à mão (o upsert casa por `curatedId`, null em tudo que é CUSTOM).
 */
export function MaterializeYearButton({ year, done }: { year: number; done: boolean }) {
  const t = useTranslations("planning.dates");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      const res = await materializeCatalogYear(year);
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      const r = res as { created: number; updated: number };
      toast.success(t("materialized", { year, created: r.created, updated: r.updated }));
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={isPending}
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-60 ${
        done
          ? "border-border bg-card text-muted-foreground hover:bg-accent"
          : "border-primary bg-primary/10 text-primary hover:bg-primary/20"
      }`}
    >
      <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} aria-hidden="true" />
      {done ? t("regenerateYear", { year }) : t("generateYear", { year })}
    </button>
  );
}
