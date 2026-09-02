import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getWeekPlanning } from "@/lib/actions/week-planning";
// Não vêm de `week-planning.ts`: aquele arquivo é `"use server"`, que só pode exportar função
// assíncrona — um `export const` lá quebra `next build` em runtime. Ver lib/planning/week-capacity.ts.
import { DAY_VISUAL_HOURS, DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";
import {
  mondayOfWeek,
  parseWeekParam,
  formatISODate,
  formatDisplayDate,
  formatDisplayTime,
  todayInSaoPaulo,
} from "@/lib/dates";
// O envelhecimento por ETAPA já existe e é consumido daqui, não reimplementado: duas
// implementações da mesma leitura divergiriam, e a segunda quase certamente viraria a punitiva.
import { stageAgingRatio } from "@/lib/team-health-format";
// ...mas alimentado na unidade certa: a referência da etapa é hora de TRABALHO, então o decorrido
// também precisa ser. Ver lib/planning/working-hours.ts.
import { workingClockEquivalent } from "@/lib/planning/working-hours";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { ScheduleDialog } from "./ScheduleDialog";
import { WindowDialog } from "./WindowDialog";
import { DayDone } from "@/components/planning/DayDone";
import { WeekControls } from "./WeekControls";
import { OrderControls } from "./OrderControls";

export const metadata: Metadata = { title: "Programação da semana" };

export default async function WeekPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[]; team?: string | string[] }>;
}) {
  // Tela cortês, não trava: a trava de verdade continua dentro de getWeekPlanning (e das três
  // ações). Sem isto, um MEMBER que digitasse a URL caía numa página de erro genérica em vez de ir
  // para o login — mesma forma que app/[locale]/(protected)/planning/calendar/week/page.tsx usa.
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const [t, sp] = await Promise.all([getTranslations("planning.week"), searchParams]);
  const monday = mondayOfWeek(parseWeekParam(sp.week));
  const teamId = Array.isArray(sp.team) ? sp.team[0] : sp.team;

  const [plan, teams] = await Promise.all([
    getWeekPlanning(formatISODate(monday), teamId),
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const pessoas = plan.people.map((p) => ({ id: p.userId, name: p.name }));
  const semanaCorrente = formatISODate(mondayOfWeek(todayInSaoPaulo())) === formatISODate(monday);
  // Um instante só para a tela inteira: cada célula recalculando `Date.now()` faria dois itens
  // idênticos imprimirem números diferentes no mesmo render.
  const agora = Date.now();

  // Conflito é a primeira coisa que o gestor precisa ver: agendamento que não vai acontecer só
  // aparece a tempo se estiver no topo. Traz o rótulo (tarefa/etapa) e o motivo (derivado do status
  // da etapa) — sem isso o gestor sabe QUE algo está em risco, mas não O QUE remarcar.
  const motivoDoConflito: Record<string, string> = {
    INACTIVE: t("conflictReasonInactive"),
    BLOCKED: t("conflictReasonBlocked"),
  };
  const conflitos = plan.people.flatMap((p) =>
    plan.days.flatMap((d) =>
      p.byDay[d].slots
        .filter((s) => s.kind === "conflict")
        .map((s) => ({
          person: p.name,
          day: d,
          id: s.item.id,
          taskTitle: s.item.taskTitle,
          stageName: s.item.stageName,
          // A HORA é o que se precisa para remarcar: "quinta" não diz se dá para trocar com o que
          // está antes. É a razão de o item ser fixo, então é a informação que resolve o conflito.
          time: s.item.scheduledStart ? formatDisplayTime(s.item.scheduledStart) : null,
          // Status fora de INACTIVE/BLOCKED não deveria existir num conflito (agendado + não
          // liberado só nasce de um desses dois) — se acontecer, a linha aparece sem motivo em vez
          // de inventar um.
          reason: s.item.stageStatus ? motivoDoConflito[s.item.stageStatus] : undefined,
        }))
    )
  );

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={`${t("subtitle")} · ${t("weekOf", { date: formatDisplayDate(monday) })}`}
        actions={
          <WeekControls
            monday={monday}
            isCurrentWeek={semanaCorrente}
            teams={teams}
            teamId={teamId}
          />
        }
      />

      {conflitos.length > 0 && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger-subtle p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-danger">{t("conflictsTitle")}</p>
              <p className="mt-1 text-sm text-foreground/80">{t("conflictsHelp")}</p>
              <ul className="mt-2 space-y-0.5 text-sm text-foreground">
                {conflitos.map((c) => (
                  <li key={c.id}>
                    <span className="font-medium">{c.taskTitle}</span>
                    {c.stageName && ` · ${c.stageName}`} · {c.person} · {c.day}
                    {c.time && ` ${c.time}`}
                    {c.reason && <span className="text-foreground/70"> — {c.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(16rem,1fr)]">
        <SectionCard bodyClassName="p-0">
          {/* Régua de 8h visível uma vez por tabela — não repetida em cada célula, que viraria
              ruído — e fora da área de rolagem horizontal, senão some ao arrastar a grade larga.
              É referência visual, não meta: o `title` de cada célula (abaixo) repete o aviso para
              quem passa o mouse, mas em touch ele nunca aparece — por isso a legenda fixa aqui. */}
          <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
            {t("dayRuler", { hours: DAY_VISUAL_HOURS })}
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-foreground">
                    ·
                  </th>
                  {plan.days.map((d) => (
                    <th
                      key={d}
                      className="px-4 py-3 text-left text-xs font-bold uppercase text-foreground"
                    >
                      {d.slice(8, 10)}/{d.slice(5, 7)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plan.people.map((p) => (
                  <tr key={p.userId} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {/* Só o que a linha TEM: sem nada apontado, o número segue o de sempre.
                            Feito e previsto nunca se somam — um é medição, o outro estimativa. */}
                        {p.doneHours > 0
                          ? t("capacityWithDone", {
                              done: p.doneHours.toFixed(1),
                              used: p.usedHours.toFixed(1),
                              total: p.weeklyHours,
                            })
                          : t("capacity", {
                              used: p.usedHours.toFixed(1),
                              total: p.weeklyHours,
                            })}
                      </p>
                      {p.weeklyHours === DEFAULT_WEEKLY_HOURS && (
                        <p className="text-xs text-warning">
                          {t("noCapacity", { hours: DEFAULT_WEEKLY_HOURS })}
                        </p>
                      )}
                    </td>
                    {plan.days.map((d) => {
                      const dia = p.byDay[d];
                      return (
                        <td key={d} className="px-4 py-3">
                          {/* A régua de 8h é VISUAL e a tela diz isso — número em barra vira meta na
                            cabeça de quem olha, mesmo sem ninguém ter decidido isso. */}
                          {/* A célula diz só o que ela tem. Dia futuro não tem feito; dia passado
                              e entregue não tem previsto — mostrar "0.0h" nos dois casos seria
                              ruído com aparência de informação. A régua de 8h acompanha o
                              PREVISTO, que é o que ela mede. */}
                          <p
                            className="mb-1 text-xs text-muted-foreground"
                            title={t("dayRuler", { hours: DAY_VISUAL_HOURS })}
                          >
                            {dia.doneHours > 0 && (
                              <span className="text-success">
                                {t("doneHours", { hours: dia.doneHours.toFixed(1) })}
                              </span>
                            )}
                            {dia.doneHours > 0 && dia.usedHours > 0 && " · "}
                            {(dia.usedHours > 0 || dia.doneHours === 0) &&
                              `${dia.usedHours.toFixed(1)}h / ${DAY_VISUAL_HOURS}h`}
                          </p>
                          <DayDone done={dia.done} />
                          <ul className="space-y-1">
                            {dia.slots.map((s) => {
                              // Envelhecimento DESTA etapa contra a referência da classe — leitura
                              // sobre o TRABALHO, nunca nota da pessoa: aparece no item, com a
                              // referência ao lado, como convite a olhar. Só quando passa da
                              // referência (senão seria ruído em toda célula) e só quando existe
                              // referência: sem ela a razão não significa nada.
                              const passou =
                                s.item.activeSince && s.item.referenceHours > 0
                                  ? stageAgingRatio(
                                      // Hora ÚTIL contra hora útil. Com o relógio cru, uma etapa
                                      // de 2h ativa desde ontem já acusaria "24h nesta etapa" e o
                                      // aviso acenderia em quase toda célula — sinal que acende
                                      // sempre não é sinal.
                                      workingClockEquivalent(s.item.activeSince, agora),
                                      s.item.referenceHours,
                                      agora
                                    )
                                  : 0;
                              return (
                                <li
                                  key={s.item.id}
                                  className={`rounded border px-2 py-1 text-xs ${
                                    s.kind === "conflict"
                                      ? "border-danger/40 bg-danger-subtle text-danger"
                                      : s.kind === "waiting"
                                        ? "border-border bg-muted/40 text-muted-foreground"
                                        : "border-border bg-card text-foreground"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      {/* QUE trabalho é. Sem isto a célula era um chip anônimo de
                                        "2.0h" — e distribuir semana olhando para horas sem nome é
                                        decidir no escuro. Os dois rótulos já viajam no item. */}
                                      <p className="truncate font-medium">{s.item.taskTitle}</p>
                                      {s.item.stageName && (
                                        <p className="truncate opacity-80">{s.item.stageName}</p>
                                      )}
                                      <p>
                                        {s.kind === "waiting" && `(${t("waiting")}) `}
                                        {/* Distingue o que o gestor programou do que a pessoa
                                            puxou por conta: os dois ocupam o dia, mas só um foi
                                            decisão dele. */}
                                        {s.item.semDia && `(${t("queued")}) `}
                                        {/* A HORA vem junto do rótulo "agendada": é a razão de o
                                          item ser fixo. Também no conflito, que é agendado e não
                                          liberado — ali ela é o que o gestor precisa para remarcar. */}
                                        {s.item.scheduledStart &&
                                          `(${t("scheduled")} ${formatDisplayTime(s.item.scheduledStart)}) `}
                                        {s.item.referenceHours.toFixed(1)}h
                                        {/* `referenceSource === "declared"` cobre tanto o SLA
                                          cadastrado quanto o caso sem amostra NEM SLA (hours: 0) —
                                          os dois são estimativa, nunca "etapa de graça". */}
                                        {s.item.referenceSource === "declared" && (
                                          <span className="italic opacity-80">
                                            {" "}
                                            ({t("estimated")})
                                          </span>
                                        )}
                                      </p>
                                      {passou > 1 && (
                                        // Cor de ATENÇÃO, nunca de erro: a causa de uma etapa
                                        // travada costuma ser do sistema (dependência, retrabalho,
                                        // briefing ruim), não de quem a executa.
                                        <p className="text-warning">
                                          {t("aging", {
                                            elapsed: (passou * s.item.referenceHours).toFixed(1),
                                            reference: s.item.referenceHours.toFixed(1),
                                          })}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <WindowDialog
                                        activeStageId={s.item.id}
                                        label={`${s.item.taskTitle} · ${s.item.stageName}`}
                                        startTime={
                                          s.item.scheduledStart
                                            ? formatDisplayTime(s.item.scheduledStart)
                                            : null
                                        }
                                        endTime={
                                          s.item.scheduledEnd
                                            ? formatDisplayTime(s.item.scheduledEnd)
                                            : null
                                        }
                                      />
                                      <OrderControls activeStageId={s.item.id} />
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title={t("poolTitle")} bodyClassName="space-y-2 p-4">
          {plan.pool.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("poolEmpty")}</p>
          ) : (
            plan.pool.map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">{item.taskTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {item.clientName} · {item.stageName} · {item.referenceHours.toFixed(1)}h
                  {item.referenceSource === "declared" && (
                    <span className="italic"> ({t("estimated")})</span>
                  )}
                </p>
                <div className="mt-2">
                  <ScheduleDialog
                    activeStageId={item.id}
                    label={`${item.taskTitle} · ${item.stageName}`}
                    teamName={item.teamName}
                    // Só quem é da equipe da etapa. A etapa coringa que ninguém roteou não tem
                    // equipe, e aí vale a lista inteira — não há regra a violar.
                    people={item.eligible.length > 0 ? item.eligible : pessoas}
                    days={plan.days}
                  />
                </div>
              </div>
            ))
          )}
        </SectionCard>
      </div>
    </div>
  );
}
