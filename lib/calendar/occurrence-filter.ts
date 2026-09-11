/**
 * Recorte das ocorrências do calendário por TIPO e por PAÍS.
 *
 * Existe porque o catálogo cresceu de 41 para 153 datas no ano quando a lista de datas
 * comemorativas do cliente entrou (ver lib/calendar/events.ts). Setembro sozinho tem 21 marcas. Um
 * calendário em que todo dia tem alguma coisa para de ajudar a escolher: vira ruído com cara de
 * informação. O filtro devolve ao gestor a pergunta "o que É PRA MIM neste mês".
 *
 * Módulo puro de propósito — sem Prisma, sem React. O recorte é uma regra, e regra se testa sem
 * subir banco nem renderizar tela.
 */

/** Os valores que o schema admite (`OccurrenceKind`). */
const KINDS = ["HOLIDAY", "COMMERCIAL", "EVENT"] as const;
/** Os valores que o schema admite (`EventCountry`). */
const COUNTRIES = ["AR", "BR", "PY"] as const;

export type OccurrenceKindFilter = (typeof KINDS)[number];
export type OccurrenceCountryFilter = (typeof COUNTRIES)[number];

export interface OccurrenceFilter {
  kind?: OccurrenceKindFilter;
  country?: OccurrenceCountryFilter;
}

/** A forma mínima que o filtro precisa ler. Serve tanto para a linha do banco quanto para o
 *  evento do catálogo — os dois têm tipo e países. */
interface Filtravel {
  kind: string;
  countries: string[];
}

/**
 * Aplica o recorte. Os dois campos são conjunção: tipo E país, nunca OU — pedir "feriado" e "PY"
 * é pedir os feriados paraguaios, não a união dos dois conjuntos.
 *
 * Devolve a MESMA referência quando não há filtro nenhum: o caminho comum é sem recorte, e recriar
 * o array ali só geraria renderização à toa.
 */
export function filterOccurrences<T extends Filtravel>(rows: T[], filter: OccurrenceFilter): T[] {
  if (!filter.kind && !filter.country) return rows;

  return rows.filter(
    (r) =>
      (!filter.kind || r.kind === filter.kind) &&
      (!filter.country || r.countries.includes(filter.country))
  );
}

/**
 * Lê o filtro dos parâmetros da URL.
 *
 * Valor desconhecido é **ignorado**, não vira recorte vazio: uma URL com `?dateKind=feriado` — um
 * link antigo, um parâmetro digitado à mão — esvaziaria a grade em silêncio, e quem olha não teria
 * como distinguir "o mês está vazio" de "o filtro comeu tudo".
 */
export function parseOccurrenceFilter(params: {
  dateKind?: string;
  country?: string;
}): OccurrenceFilter {
  const filter: OccurrenceFilter = {};

  const kind = KINDS.find((k) => k === params.dateKind);
  if (kind) filter.kind = kind;

  const country = COUNTRIES.find((c) => c === params.country);
  if (country) filter.country = country;

  return filter;
}
