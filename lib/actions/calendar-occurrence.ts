"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { materializeYear } from "@/lib/calendar/materialize";
import { formatISODate } from "@/lib/dates";
import { planningHorizon } from "@/lib/calendar/horizon";
import type { EventCountry, OccurrenceKind } from "@prisma/client";

const ALL_COUNTRIES: EventCountry[] = ["AR", "BR", "PY"];

export interface OccurrenceRow {
  id: string;
  iso: string; // YYYY-MM-DD
  titlePt: string;
  titleEs: string;
  kind: OccurrenceKind;
  countries: EventCountry[];
  source: "CURATED" | "CUSTOM";
  /** Demandas já vinculadas a esta data. */
  taskCount: number;
  /** Clientes DISTINTOS com pelo menos uma demanda vinculada. É a métrica que
   *  importa: 10 demandas de um cliente só não é cobertura, é concentração. */
  coveredClients: number;
}

function revalidateCalendar() {
  revalidatePath("/planning/calendar/week");
  revalidatePath("/planning/calendar/month");
  revalidatePath("/planning/dates");
}

/**
 * Ocorrências num intervalo [start, end], mais antigas primeiro.
 *
 * Substitui `getEventsInRange` (que lia do código) como fonte em tempo de
 * execução. Datas cadastradas à mão aparecem lado a lado com as do catálogo —
 * era exatamente isso que a versão em código impedia.
 */
export async function getOccurrencesInRange(range: {
  start: Date;
  end: Date;
}): Promise<OccurrenceRow[]> {
  await requireManagerOrAdmin();

  const rows = await prisma.calendarOccurrence.findMany({
    where: { date: { gte: range.start, lte: range.end } },
    orderBy: [{ date: "asc" }, { titlePt: "asc" }],
    select: {
      id: true,
      date: true,
      titlePt: true,
      titleEs: true,
      kind: true,
      countries: true,
      source: true,
      _count: { select: { tasks: true } },
    },
  });

  // Clientes distintos por data. Uma query só para todas as datas da janela, e a
  // deduplicação em memória — o Prisma não faz "contar distintos por grupo", e o
  // volume aqui é o das demandas vinculadas, não o da base inteira.
  const linked = await prisma.task.findMany({
    where: { calendarOccurrenceId: { in: rows.map((r) => r.id) } },
    select: { calendarOccurrenceId: true, project: { select: { clientId: true } } },
  });
  const clientsByOccurrence = new Map<string, Set<string>>();
  for (const t of linked) {
    if (!t.calendarOccurrenceId) continue;
    const set = clientsByOccurrence.get(t.calendarOccurrenceId) ?? new Set<string>();
    set.add(t.project.clientId);
    clientsByOccurrence.set(t.calendarOccurrenceId, set);
  }

  return rows.map((r) => ({
    id: r.id,
    iso: formatISODate(r.date),
    titlePt: r.titlePt,
    titleEs: r.titleEs,
    kind: r.kind,
    countries: r.countries,
    source: r.source,
    taskCount: r._count.tasks,
    coveredClients: clientsByOccurrence.get(r.id)?.size ?? 0,
  }));
}

/**
 * Denominador da cobertura: clientes com pelo menos um projeto ATIVO.
 *
 * Cliente sem projeto ativo apareceria como lacuna eterna em toda data e
 * empurraria a estatística para baixo sem que houvesse ação possível.
 */
export async function getActiveClientCount(): Promise<number> {
  await requireManagerOrAdmin();
  return prisma.client.count({ where: { projects: { some: { status: "ACTIVE" } } } });
}

/** Anos que já têm ocorrências CURATED materializadas. */
export async function getMaterializedYears(): Promise<number[]> {
  await requireManagerOrAdmin();
  const rows = await prisma.calendarOccurrence.findMany({
    where: { source: "CURATED" },
    select: { date: true },
  });
  return Array.from(new Set(rows.map((r) => r.date.getUTCFullYear()))).sort();
}

/**
 * Gera (ou atualiza) as datas do catálogo para um ano. Idempotente e seguro:
 * casa por `curatedId`, então nunca encosta no que foi cadastrado à mão.
 */
export async function materializeCatalogYear(year: number) {
  await requireManagerOrAdmin();

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    const t = await getTranslations("errors.calendar");
    return { error: t("invalidYear") };
  }

  const result = await materializeYear(prisma, year);
  revalidateCalendar();
  return { success: true, ...result };
}

export interface OccurrenceInput {
  date: string; // YYYY-MM-DD
  titlePt: string;
  titleEs: string;
  kind: OccurrenceKind;
}

async function parseInput(formData: FormData): Promise<OccurrenceInput | { error: string }> {
  const t = await getTranslations("errors.calendar");

  const date = String(formData.get("date") ?? "").trim();
  const titlePt = String(formData.get("titlePt") ?? "").trim();
  const titleEs = String(formData.get("titleEs") ?? "").trim();
  const kind = String(formData.get("kind") ?? "EVENT") as OccurrenceKind;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: t("invalidDate") };

  // Fora da janela a linha existiria sem aparecer em lugar nenhum.
  const { start, end } = planningHorizon();
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (parsedDate < start || parsedDate > end) {
    return {
      error: t("dateOutsideHorizon", { start: formatISODate(start), end: formatISODate(end) }),
    };
  }
  if (!titlePt) return { error: t("titlePtRequired") };
  // P8: a data aparece nos dois idiomas do app, então o título espanhol não é
  // opcional — cair no português no es-ES seria vazamento de idioma.
  if (!titleEs) return { error: t("titleEsRequired") };
  if (!["HOLIDAY", "COMMERCIAL", "EVENT"].includes(kind)) return { error: t("invalidType") };

  return { date, titlePt, titleEs, kind };
}

/** Cadastra uma data própria (FestPop, feira, ativação local). Sempre CUSTOM. */
export async function createOccurrence(formData: FormData) {
  await requireManagerOrAdmin();
  const parsed = await parseInput(formData);
  if ("error" in parsed) return parsed;

  await prisma.calendarOccurrence.create({
    data: {
      date: new Date(`${parsed.date}T00:00:00.000Z`),
      titlePt: parsed.titlePt,
      titleEs: parsed.titleEs,
      kind: parsed.kind,
      countries: ALL_COUNTRIES,
      source: "CUSTOM",
      // seriesKey null: um evento avulso não pertence a uma série anual. Duas
      // edições da FestPop no mesmo ano são duas linhas independentes.
      seriesKey: null,
    },
  });

  revalidateCalendar();
  return { success: true };
}

export async function updateOccurrence(formData: FormData) {
  await requireManagerOrAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: (await getTranslations("errors.common"))("idMissing") };

  const parsed = await parseInput(formData);
  if ("error" in parsed) return parsed;

  const existing = await prisma.calendarOccurrence.findUnique({
    where: { id },
    select: { source: true },
  });
  if (!existing) {
    const tCommon = await getTranslations("errors.common");
    return { error: tCommon("dateNotFound") };
  }
  // Editar uma linha CURATED seria perdido na próxima rematerialização — melhor
  // recusar do que aceitar em silêncio uma edição com prazo de validade.
  if (existing.source === "CURATED") {
    const t = await getTranslations("errors.calendar");
    return { error: t("catalogNotEditable") };
  }

  await prisma.calendarOccurrence.update({
    where: { id },
    data: {
      date: new Date(`${parsed.date}T00:00:00.000Z`),
      titlePt: parsed.titlePt,
      titleEs: parsed.titleEs,
      kind: parsed.kind,
    },
  });

  revalidateCalendar();
  return { success: true };
}

export async function deleteOccurrence(formData: FormData) {
  await requireManagerOrAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: (await getTranslations("errors.common"))("idMissing") };

  const existing = await prisma.calendarOccurrence.findUnique({
    where: { id },
    select: { source: true },
  });
  if (!existing) {
    const tCommon = await getTranslations("errors.common");
    return { error: tCommon("dateNotFound") };
  }
  if (existing.source === "CURATED") {
    const t = await getTranslations("errors.calendar");
    return { error: t("catalogNotRemovable") };
  }

  // As demandas vinculadas sobrevivem: a FK é SET NULL. Apagar uma data do
  // calendário não pode arrastar o trabalho junto.
  await prisma.calendarOccurrence.delete({ where: { id } });

  revalidateCalendar();
  return { success: true };
}
