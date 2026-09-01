import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getClientLoad } from "@/lib/actions/client-load";
import {
  mondayOfWeek,
  parseWeekParam,
  formatISODate,
  formatDisplayDate,
  todayInSaoPaulo,
} from "@/lib/dates";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { ClientLoadControls } from "./ClientLoadControls";

export const metadata: Metadata = { title: "Carga por cliente" };

export default async function ClientLoadPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[]; team?: string | string[] }>;
}) {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const sp = await searchParams;
  const monday = parseWeekParam(sp.week);
  // Mesmo tratamento da tela irmã (planning/week): a URL pode repetir `?team=`, e o Next entrega
  // array nesse caso — sem isto o tipo mentiria e o filtro do Prisma quebraria em runtime.
  const teamId = Array.isArray(sp.team) ? sp.team[0] : sp.team;
  const t = await getTranslations("planning.clientLoad");
  const [carga, teams] = await Promise.all([
    getClientLoad(formatISODate(monday), teamId),
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={`${t("subtitle")} · ${t("weekOf", { date: formatDisplayDate(monday) })}`}
        actions={
          <ClientLoadControls
            monday={monday}
            isCurrentWeek={formatISODate(monday) === formatISODate(mondayOfWeek(todayInSaoPaulo()))}
            teams={teams}
            teamId={teamId}
          />
        }
      />

      {/* De onde vêm as horas, dito na própria tela: sem isto, o número passa por apontamento e a
          leitura vira cobrança de tempo. */}
      <p className="mb-2 text-xs text-muted-foreground">{t("ruler")}</p>

      <p className="mb-3 text-xs text-muted-foreground">
        <span className="text-success">✓</span> {t("legend").split(" / ")[0]} ·{" "}
        <span className="text-primary">▶</span> {t("legend").split(" / ")[1]}
      </p>

      <SectionCard bodyClassName="overflow-x-auto p-0">
        {carga.clients.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <table className="min-w-full table-fixed divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="w-40 px-3 py-2 text-left text-xs font-bold uppercase text-foreground">
                  {t("client")}
                </th>
                {carga.days.map((d) => (
                  <th
                    key={d}
                    className="px-3 py-2 text-left text-xs font-bold uppercase text-foreground"
                  >
                    {d.slice(8, 10)}/{d.slice(5, 7)}
                  </th>
                ))}
                <th className="w-28 px-3 py-2 text-left text-xs font-bold uppercase text-foreground">
                  {t("total")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {carga.clients.map((c) => (
                <tr key={c.clientId} className="align-top">
                  <td className="px-3 py-2 text-sm font-semibold text-foreground">
                    <span className="block truncate" title={c.clientName}>
                      {c.clientName}
                    </span>
                  </td>
                  {carga.days.map((d) => {
                    const dia = c.byDay[d];
                    return (
                      <td key={d} className="px-3 py-2 align-top text-xs">
                        {dia.tasks.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-2">
                            {dia.tasks.map((tarefa) => (
                              <div
                                key={tarefa.taskId}
                                className="rounded border border-border bg-card p-1.5"
                              >
                                {/* Cabeçalho da demanda: nome cortado com reticências, números
                                    SEMPRE visíveis — o que se lê de relance é a carga, e ela não
                                    pode ser o primeiro a sumir quando o nome é longo. */}
                                <div className="flex items-baseline justify-between gap-2">
                                  <span
                                    className="truncate font-medium text-foreground"
                                    title={`${tarefa.projectName} · ${tarefa.taskTitle}`}
                                  >
                                    {tarefa.projectName} · {tarefa.taskTitle}
                                  </span>
                                  <span className="shrink-0 whitespace-nowrap tabular-nums">
                                    <span className="text-success">{fmtH(tarefa.doneHours)}</span>
                                    <span className="text-muted-foreground">/</span>
                                    <span className="text-primary">
                                      {fmtH(tarefa.pendingHours)}
                                    </span>
                                  </span>
                                </div>
                                <ul className="mt-1 space-y-0.5">
                                  {tarefa.stages.map((etapa) => (
                                    <li
                                      key={etapa.id}
                                      className="flex items-baseline justify-between gap-2 text-muted-foreground"
                                    >
                                      <span
                                        className="truncate"
                                        title={`${etapa.stageOrder}. ${etapa.stageName} · ${
                                          etapa.assigneeName ?? ""
                                        }`}
                                      >
                                        {etapa.stageOrder}. {etapa.stageName}
                                        {etapa.assigneeName && ` · ${curto(etapa.assigneeName)}`}
                                      </span>
                                      <span className="shrink-0 whitespace-nowrap tabular-nums">
                                        {etapa.state === "done" && (
                                          <span className="text-success">✓ </span>
                                        )}
                                        {etapa.state === "pending" && (
                                          <span className="text-primary">▶ </span>
                                        )}
                                        {etapa.state === "waiting" && (
                                          <span title={t("waiting")}>· </span>
                                        )}
                                        {fmtH(etapa.hours)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-sm font-semibold tabular-nums text-foreground">
                    <span className="text-success">{fmtH(c.totalDone)}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-primary">{fmtH(c.totalPending)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}

/** "3h", "2.5h" — sem o `.0` que só ocupa espaço numa célula cheia de números. */
function fmtH(h: number): string {
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

/** Nome e sobrenome. O resto do nome não distingue ninguém dentro de uma agência e come a largura
 *  que os números precisam. */
function curto(nome: string): string {
  return nome.split(/\s+/).slice(0, 2).join(" ");
}
