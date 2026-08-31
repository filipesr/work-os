import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, PartyPopper } from "lucide-react";
import { getSessionUser } from "@/lib/permissions";
import { getMyWeek } from "@/lib/actions/my-week";
import { DAY_VISUAL_HOURS, DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";
import {
  mondayOfWeek,
  parseWeekParam,
  formatISODate,
  formatDisplayDate,
  formatDisplayTime,
  todayInSaoPaulo,
} from "@/lib/dates";
import { stageAgingRatio } from "@/lib/team-health-format";
import { workingClockEquivalent } from "@/lib/planning/working-hours";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { WeekNav } from "@/components/shared/WeekNav";
import { MyDayControls } from "./MyDayControls";
import { PullDialog } from "./PullDialog";

export const metadata: Metadata = { title: "Minha semana" };

export default async function MyWeekPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await getSessionUser();
  } catch {
    redirect("/auth/signin");
  }

  const sp = await searchParams;
  const monday = parseWeekParam(sp.week);
  const t = await getTranslations("planning.myWeek");
  const semana = await getMyWeek(formatISODate(monday));
  const agora = Date.now();

  const conflitos = semana.days.flatMap((d) =>
    semana.byDay[d].slots.filter((s) => s.kind === "conflict").map((s) => ({ dia: d, slot: s }))
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={`${t("subtitle")} · ${t("weekOf", { date: formatDisplayDate(monday) })}`}
        actions={
          <WeekNav
            monday={monday}
            isCurrentWeek={formatISODate(monday) === formatISODate(mondayOfWeek(todayInSaoPaulo()))}
            labels={{
              previous: t("previousWeek"),
              next: t("nextWeek"),
              current: t("currentWeek"),
            }}
          />
        }
      />

      <p className="mb-4 text-sm text-muted-foreground">
        {t("capacity", { used: semana.usedHours.toFixed(1), total: semana.weeklyHours })}
        {semana.weeklyHours === DEFAULT_WEEKLY_HOURS && (
          <span className="ml-2 text-warning">
            {t("noCapacity", { hours: DEFAULT_WEEKLY_HOURS })}
          </span>
        )}
      </p>

      {/* O reconhecimento. Só existe no lado positivo — não há a versão inversa, e o número que o
          produziu não é gravado em lugar nenhum. Ver lib/planning/own-pace.ts. */}
      {semana.praise && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-success/40 bg-success-subtle p-3 text-sm text-success">
          <PartyPopper className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("praise")}
        </div>
      )}

      {conflitos.length > 0 && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger-subtle p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-danger">{t("conflictsTitle")}</p>
              <p className="mt-1 text-sm text-foreground/80">{t("conflictsHelp")}</p>
              <ul className="mt-2 space-y-0.5 text-sm text-foreground">
                {conflitos.map(({ dia, slot }) => (
                  <li key={slot.item.id}>
                    {slot.item.taskTitle} · {slot.item.stageName} · {dia.slice(8, 10)}/
                    {dia.slice(5, 7)}
                    {slot.item.scheduledStart
                      ? ` · ${formatDisplayTime(slot.item.scheduledStart)}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* A régua é VISUAL e a tela diz isso: número em barra vira meta na cabeça de quem olha,
          mesmo sem ninguém ter decidido isso. */}
      <p className="mb-2 text-xs text-muted-foreground">
        {t("dayRuler", { hours: DAY_VISUAL_HOURS })}
      </p>

      <div className="space-y-4">
        {semana.days.map((d) => {
          const dia = semana.byDay[d];
          const hoje = d === semana.todayISO;
          return (
            <SectionCard
              key={d}
              title={`${d.slice(8, 10)}/${d.slice(5, 7)}`}
              subtitle={`${dia.usedHours.toFixed(1)}h / ${DAY_VISUAL_HOURS}h`}
              className={hoje ? "border-primary/40" : undefined}
            >
              {dia.slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              ) : (
                <ul className="space-y-2">
                  {dia.slots.map((s) => {
                    // Envelhecimento DESTA etapa contra a referência da classe — leitura sobre o
                    // TRABALHO, nunca nota da pessoa. Em hora ÚTIL, para o aviso não acender em
                    // tudo: um sinal que acende sempre não é sinal.
                    const passou =
                      s.item.activeSince && s.item.referenceHours > 0
                        ? stageAgingRatio(
                            workingClockEquivalent(s.item.activeSince, agora),
                            s.item.referenceHours,
                            agora
                          )
                        : 0;
                    return (
                      <li
                        key={s.item.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm ${
                          s.kind === "conflict"
                            ? "border-danger/40 bg-danger-subtle text-danger"
                            : s.kind === "waiting"
                              ? "border-border bg-muted/40 text-muted-foreground"
                              : "border-border bg-card text-foreground"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {s.item.taskTitle} · {s.item.stageName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.item.referenceHours.toFixed(1)}h
                            {s.item.referenceSource === "declared" && ` · ${t("estimated")}`}
                            {s.kind === "waiting" && ` · ${t("waiting")}`}
                            {/* Reivindicada e ainda sem dia: está na fila de hoje porque alguém a
                                pegou, não porque foi programada. */}
                            {s.item.semDia && ` · ${t("queued")}`}
                            {s.kind === "scheduled" &&
                              s.item.scheduledStart &&
                              ` · ${t("scheduled")} ${formatDisplayTime(s.item.scheduledStart)}`}
                          </p>
                          {passou > 1 && s.item.activeSince && (
                            <p className="text-xs text-warning">
                              {t("aging", {
                                elapsed: (passou * s.item.referenceHours).toFixed(1),
                                reference: s.item.referenceHours.toFixed(1),
                              })}
                            </p>
                          )}
                        </div>
                        {/* Compromisso marcado não é reordenado nem movido: ele acontece na hora
                            dele. Sem controles, a regra fica óbvia na tela. */}
                        {!s.item.scheduledStart && (
                          <MyDayControls
                            activeStageId={s.item.id}
                            days={semana.days}
                            currentDay={d}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* O fim do dia: cumprido, e o próximo já visível como convite — não como cobrança.
                  `dayDone` já exige que o dia TENHA tido itens: dizer "dia cumprido" numa quinta
                  vazia, logo abaixo de "Nada programado neste dia", era a tela se contradizendo. */}
              {hoje && semana.dayDone && (
                <p className="mt-3 text-sm text-success">
                  {t("dayDone")}
                  {semana.nextUp && (
                    <span className="ml-1 text-foreground">
                      {t("nextUp", {
                        task: semana.nextUp.taskTitle,
                        stage: semana.nextUp.stageName,
                        day: `${semana.nextUp.dayISO.slice(8, 10)}/${semana.nextUp.dayISO.slice(5, 7)}`,
                      })}
                    </span>
                  )}
                </p>
              )}
            </SectionCard>
          );
        })}
      </div>

      <SectionCard title={t("poolTitle")} className="mt-6">
        {semana.pool.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("poolEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {semana.pool.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {p.taskTitle} · {p.stageName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.clientName} · {p.referenceHours.toFixed(1)}h
                    {p.referenceSource === "declared" && ` · ${t("estimated")}`}
                  </p>
                </div>
                <PullDialog
                  activeStageId={p.id}
                  label={`${p.taskTitle} · ${p.stageName}`}
                  days={semana.days}
                  defaultDay={semana.todayISO ?? semana.days[0]}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
