import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ProjectTimeline as Timeline } from "@/lib/actions/project-timeline";

/** "3h", "2.5h" — sem o `.0` que só ocupa espaço numa célula cheia de números. */
function fmtH(h: number): string {
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

/** Nome e sobrenome. O resto não distingue ninguém dentro de uma agência e come a largura que os
 *  números precisam. */
function curto(nome: string): string {
  return nome.split(/\s+/).slice(0, 2).join(" ");
}

function ddmm(diaISO: string): string {
  return `${diaISO.slice(8, 10)}/${diaISO.slice(5, 7)}`;
}

/** A grade: tempo no eixo vertical (futuro em cima, hoje no meio, passado abaixo), demandas no
 *  horizontal. A gramática visual é a mesma da carga por cliente — quem já lê uma, lê a outra. */
export async function ProjectTimeline({ data }: { data: Timeline }) {
  const t = await getTranslations("projects.timeline");

  if (data.demands.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">{t("noDemands")}</p>;
  }

  // "feito / em curso / não liberada / referência" — os rótulos vêm do locale, os glifos e as
  // cores ficam no código para bater com as mesmas cores usadas nas células (mesma gramática
  // visual da carga por cliente).
  const [legendDone, legendPending, legendWaiting, legendReference] = t("legend").split(" / ");

  return (
    <>
      <p className="mb-2 text-xs text-muted-foreground">
        <span className="text-success">✓</span> {legendDone} ·{" "}
        <span className="text-primary">▶</span> {legendPending} · <span>·</span> {legendWaiting} ·{" "}
        <span className="text-muted-foreground">~</span> {legendReference}
      </p>
      {/* Ao lado da legenda, não abaixo da tabela: lá embaixo "esta linha" não tinha antecedente
          (item 9 do ledger) — aqui ela aponta pra régua de hoje que está bem acima. */}
      <p className="mb-2 text-xs text-muted-foreground">{t("futureHint")}</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="min-w-full table-fixed border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-20 bg-card px-2 py-2 text-left font-bold uppercase text-foreground">
                {t("dateColumn")}
              </th>
              {data.demands.map((d) => (
                <th
                  key={d.taskId}
                  className="min-w-[12rem] px-2 py-2 text-left font-bold text-foreground"
                >
                  {/* A demanda tem que continuar clicável — tirar essa capacidade em silêncio ao
                      apagar o TaskCard do kanban é o mesmo erro que a spec proíbe pros filtros. */}
                  <Link
                    href={`/tasks/${d.taskId}`}
                    className={`block truncate hover:underline ${
                      d.discarded ? "text-muted-foreground line-through" : ""
                    }`}
                    title={d.title}
                  >
                    {d.title}
                  </Link>
                  {/* Descartada continua na tela porque as horas dela foram gastas de verdade — mas
                      riscada, para ninguém somar ao que ainda vai acontecer. O cinza é o mesmo tom
                      que `lib/status-styles.ts` já dá a OBSOLETE. */}
                  {d.discarded && (
                    <span className="mr-1 text-muted-foreground">{t("discarded")}</span>
                  )}
                  {d.dueDateISO && (
                    <span className={d.overdue ? "text-danger" : "text-muted-foreground"}>
                      {t(d.overdue ? "overdue" : "dueOn", { date: ddmm(d.dueDateISO) })}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              if (row.kind === "gap") {
                // O vão é a informação principal desta tela: um trecho parado no meio do projeto é o
                // que ninguém enxergava antes, e costuma ser a explicação do atraso.
                return (
                  <tr key={`gap-${row.fromISO}`}>
                    <td
                      colSpan={data.demands.length + 1}
                      className="border-y border-dashed border-border bg-muted/30 px-2 py-1 text-center text-[11px] text-muted-foreground"
                    >
                      {t("gap", { days: row.days })} · {ddmm(row.fromISO)} – {ddmm(row.toISO)}
                    </td>
                  </tr>
                );
              }
              const futuro = row.dayISO > data.todayISO;
              const hoje = row.dayISO === data.todayISO;
              return (
                <tr key={row.dayISO} className={futuro ? "opacity-70" : undefined}>
                  <td
                    className={`sticky left-0 z-10 whitespace-nowrap px-2 py-1 align-top ${
                      hoje
                        ? "border-t-2 border-primary bg-card font-semibold text-primary"
                        : "bg-card text-muted-foreground"
                    }`}
                  >
                    {ddmm(row.dayISO)}
                    {hoje && <span className="ml-1 text-[10px]">{t("today")}</span>}
                    {futuro && <span className="ml-1 text-[10px]">{t("future")}</span>}
                  </td>
                  {data.demands.map((d) => {
                    const cel = data.byDay[row.dayISO]?.[d.taskId];
                    return (
                      <td
                        key={d.taskId}
                        className={`px-2 py-1 align-top ${hoje ? "border-t-2 border-primary" : ""}`}
                      >
                        {!cel ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {cel.lines.map((l, i) => (
                              <li key={`${l.stageId}-${i}`} className="flex justify-between gap-2">
                                <span
                                  className="truncate"
                                  title={`${l.stageName} · ${l.assigneeName ?? ""}`}
                                >
                                  {l.state === "done" && <span className="text-success">✓ </span>}
                                  {l.state === "pending" && (
                                    <span className="text-primary">▶ </span>
                                  )}
                                  {l.state === "waiting" && <span title={t("waiting")}>· </span>}
                                  {/* Hora apontada na demanda inteira, sem etapa (item 3 do
                                      ledger): a leitura não traduz, a tela decide o rótulo. */}
                                  {l.stageOrder === 0
                                    ? t("noStage")
                                    : `${l.stageOrder}. ${l.stageName}`}
                                  {l.assigneeName && ` · ${curto(l.assigneeName)}`}
                                </span>
                                <span className="shrink-0 whitespace-nowrap tabular-nums">
                                  {fmtH(l.hours)}
                                  {l.estimated && (
                                    <span
                                      className="ml-1 text-[10px] text-muted-foreground"
                                      title={t("estimatedMark")}
                                    >
                                      ~
                                    </span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
