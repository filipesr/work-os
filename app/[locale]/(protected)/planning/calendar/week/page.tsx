import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getTranslations, getLocale } from "next-intl/server";
import { getCalendarTasks } from "@/lib/actions/reporting";
import { parseWeekParam, weekRangeFromMonday, formatISODate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { CalendarFiltersBar } from "../CalendarFiltersBar";
import { PlanningModeBanner } from "../PlanningModeBanner";
import { CalendarGrid } from "@/components/planning/calendar/CalendarGrid";
import { WeekGridSkeleton } from "../skeletons";
import {
  FiltersCard,
  PeriodActions,
  loadCreateOptions,
  loadFilterOptions,
  type CalendarSearchParams,
} from "../shared";

export const metadata: Metadata = { title: "Semanal" };

/**
 * Só a GRADE fica atrás do Suspense: é a parte cara (tarefas da semana + opções
 * do diálogo de criação) e a única que muda ao navegar de período.
 *
 * Cabeçalho e filtros ficam fora de propósito. Se entrassem, piscariam a cada
 * clique de semana — e ver o próprio filtro sumir e voltar passa a sensação de
 * que a tela recarregou, quando só o conteúdo mudou.
 */
async function WeekGrid({
  params,
  planning,
  weekStart,
  weekEnd,
}: {
  params: CalendarSearchParams;
  planning: boolean;
  weekStart: Date;
  weekEnd: Date;
}) {
  const [buckets, createOptions] = await Promise.all([
    getCalendarTasks({
      weekStart,
      weekEnd,
      teamId: params.team || undefined,
      projectId: params.project || undefined,
      userId: params.user || undefined,
      showCompleted: params.showCompleted === "1",
    }),
    // Só carrega o que alimenta o diálogo de criação quando ele pode abrir.
    planning ? loadCreateOptions() : Promise.resolve(null),
  ]);

  return (
    <CalendarGrid
      buckets={buckets}
      weekStart={weekStart}
      planning={planning}
      createOptions={createOptions ?? undefined}
    />
  );
}

/**
 * Calendário SEMANAL: execução. Quem está com o quê nesta semana, e criação de
 * demanda a partir de um dia. Não reagenda — o arraste foi removido de propósito:
 * a tela é visualização e criação. Também não mostra datas comemorativas nem
 * aniversários; para isso existe a visão mensal, que é a tela de contexto.
 */
export default async function WeekCalendarPage({
  searchParams,
}: {
  searchParams: Promise<CalendarSearchParams>;
}) {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const params = await searchParams;
  // Trava de escrita na URL: sobrevive à navegação de período, então o gestor
  // liga uma vez e planeja a rodada inteira.
  const planning = params.plan === "1";
  const showCompleted = params.showCompleted === "1";

  const weekStart = parseWeekParam(params.week);
  const { end: weekEnd } = weekRangeFromMonday(weekStart);

  // O casco espera só o barato: traduções, locale e as opções de filtro — três
  // consultas simples que NÃO dependem da semana. A grade, que é a parte cara,
  // fica atrás do Suspense e chega depois.
  const [t, locale, options] = await Promise.all([
    getTranslations("reportsCalendar"),
    getLocale(),
    loadFilterOptions(params.team, params.user),
  ]);

  const fmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });
  const periodLabel = `${fmt.format(weekStart)} – ${fmt.format(weekEnd)}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <PeriodActions
            view="week"
            anchor={weekStart}
            periodLabel={periodLabel}
            planning={planning}
          />
        }
      />
      <div className="space-y-4">
        <FiltersCard>
          <CalendarFiltersBar
            teams={options.teams}
            projects={options.projects}
            users={options.userOptions}
            selected={{
              teamId: params.team,
              projectId: params.project,
              userId: options.validUserId,
              showCompleted,
            }}
          />
        </FiltersCard>
        <PlanningModeBanner enabled={planning} />

        {/* A CHAVE é o que faz o esqueleto reaparecer ao trocar de semana. Sem
            ela o React reaproveita a subárvore e a pessoa fica olhando a semana
            anterior, sem sinal nenhum, até a nova chegar. Os filtros entram na
            chave porque mudá-los também troca o conteúdo da grade. */}
        <Suspense
          key={`${formatISODate(weekStart)}|${params.team ?? ""}|${params.project ?? ""}|${params.user ?? ""}|${showCompleted}`}
          fallback={<WeekGridSkeleton />}
        >
          <WeekGrid params={params} planning={planning} weekStart={weekStart} weekEnd={weekEnd} />
        </Suspense>
      </div>
    </div>
  );
}
