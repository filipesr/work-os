import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { getWeekPlanning } from "@/lib/actions/week-planning";
// Não vêm de `week-planning.ts`: aquele arquivo é `"use server"`, que só pode exportar função
// assíncrona — um `export const` lá quebra `next build` em runtime. Ver lib/planning/week-capacity.ts.
import { DAY_VISUAL_HOURS, DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";
import { mondayOfWeek, parseWeekParam, formatISODate, formatDisplayDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { ScheduleDialog } from "./ScheduleDialog";
import { OrderControls } from "./OrderControls";

export const metadata: Metadata = { title: "Programação da semana" };

export default async function WeekPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[]; team?: string | string[] }>;
}) {
  const [t, sp] = await Promise.all([getTranslations("planning.week"), searchParams]);
  const monday = mondayOfWeek(parseWeekParam(sp.week));
  const teamId = Array.isArray(sp.team) ? sp.team[0] : sp.team;

  const plan = await getWeekPlanning(formatISODate(monday), teamId);
  const pessoas = plan.people.map((p) => ({ id: p.userId, name: p.name }));

  // Conflito é a primeira coisa que o gestor precisa ver: agendamento que não vai acontecer só
  // aparece a tempo se estiver no topo.
  const conflitos = plan.people.flatMap((p) =>
    plan.days.flatMap((d) =>
      p.byDay[d].slots
        .filter((s) => s.kind === "conflict")
        .map((s) => ({ person: p.name, day: d, id: s.item.id }))
    )
  );

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={`${t("subtitle")} · ${t("weekOf", { date: formatDisplayDate(monday) })}`}
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
                    {c.person} · {c.day}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(16rem,1fr)]">
        <SectionCard bodyClassName="overflow-x-auto p-0">
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
                      {t("capacity", { used: p.usedHours.toFixed(1), total: p.weeklyHours })}
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
                        <p
                          className="mb-1 text-xs text-muted-foreground"
                          title={t("dayRuler", { hours: DAY_VISUAL_HOURS })}
                        >
                          {dia.usedHours.toFixed(1)}h / {DAY_VISUAL_HOURS}h
                        </p>
                        <ul className="space-y-1">
                          {dia.slots.map((s) => (
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
                              <div className="flex items-center justify-between gap-2">
                                <span>
                                  {s.kind === "waiting" && `(${t("waiting")}) `}
                                  {s.kind === "scheduled" && `(${t("scheduled")}) `}
                                  {s.item.referenceHours.toFixed(1)}h
                                  {/* `referenceSource === "declared"` cobre tanto o SLA cadastrado
                                      quanto o caso sem amostra NEM SLA (hours: 0) — os dois são
                                      estimativa, nunca "etapa de graça". Ver stage-reference.ts. */}
                                  {s.item.referenceSource === "declared" && (
                                    <span className="italic text-muted-foreground">
                                      {" "}
                                      ({t("estimated")})
                                    </span>
                                  )}
                                </span>
                                <OrderControls activeStageId={s.item.id} />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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
                    people={pessoas}
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
