import type { Prisma, OccurrenceKind, EventCountry } from "@prisma/client";
import { eventsForYear, type CalendarEvent } from "@/lib/calendar/events";

// Materializa o catálogo em CÓDIGO para linhas no banco.
//
// O catálogo não morre com a migração para dado: ele calcula as datas MÓVEIS
// (Páscoa por computus, Carnaval e Corpus Christi derivados dela, Dia das Mães
// como 2º domingo de maio, Black Friday a partir do Thanksgiving). Nenhuma
// planilha sobreviveria a isso. O que muda é o papel: deixa de ser a fonte em
// tempo de execução e vira um GERADOR, rodado uma vez por ano.

/** `type` do catálogo → `kind` da ocorrência. EVENT só existe em CUSTOM. */
export function kindOf(event: CalendarEvent): OccurrenceKind {
  return event.type === "commercial" ? "COMMERCIAL" : "HOLIDAY";
}

/** ISO `YYYY-MM-DD` → meia-noite UTC (convenção de datas do repo). */
export function isoToUtcMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** O que o materializador gravaria para um evento — puro, para poder testar
 *  o mapeamento sem banco. */
export function toOccurrenceData(event: CalendarEvent) {
  return {
    date: isoToUtcMidnight(event.iso),
    titlePt: event.titlePt,
    titleEs: event.titleEs,
    kind: kindOf(event),
    countries: event.countries as EventCountry[],
    seriesKey: event.seriesKey,
    source: "CURATED" as const,
    curatedId: event.id,
  };
}

export interface MaterializeResult {
  year: number;
  created: number;
  updated: number;
}

/**
 * Insere/atualiza as ocorrências CURATED de um ano.
 *
 * Idempotente por `curatedId`: rodar duas vezes não duplica, e corrigir um
 * título no catálogo se propaga na próxima execução.
 *
 * **Nunca toca em linhas CUSTOM.** O upsert casa por `curatedId`, que é null em
 * tudo que foi cadastrado à mão — então a FestPop de outubro sobrevive a
 * qualquer rematerialização. Essa é a garantia que separa "gerar o ano que vem"
 * de "apagar o trabalho de alguém".
 */
export async function materializeYear(
  client: Pick<Prisma.TransactionClient, "calendarOccurrence">,
  year: number
): Promise<MaterializeResult> {
  const events = eventsForYear(year);
  let created = 0;
  let updated = 0;

  for (const event of events) {
    const data = toOccurrenceData(event);
    const existing = await client.calendarOccurrence.findUnique({
      where: { curatedId: event.id },
      select: { id: true },
    });

    if (existing) {
      // Atualiza só o conteúdo; `source` e `curatedId` são identidade.
      await client.calendarOccurrence.update({
        where: { curatedId: event.id },
        data: {
          date: data.date,
          titlePt: data.titlePt,
          titleEs: data.titleEs,
          kind: data.kind,
          countries: data.countries,
          seriesKey: data.seriesKey,
        },
      });
      updated++;
    } else {
      await client.calendarOccurrence.create({ data });
      created++;
    }
  }

  return { year, created, updated };
}
