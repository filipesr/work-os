/**
 * Curated holiday + commercial-date dataset for Argentina, Brazil and Paraguay.
 *
 * Computed per year (no network, deterministic): fixed-date holidays, movable
 * Easter-derived dates (Computus), and nth-weekday commercial dates used for
 * campaign planning (Mother's/Father's Day, Black Friday, etc.).
 *
 * Dates are nominal calendar dates (no timezone): each event carries an ISO
 * `YYYY-MM-DD` string and is matched against a calendar day cell by ISO equality.
 *
 * The list is intentionally curated (not exhaustive) and easy to extend.
 */

export type EventCountry = "AR" | "BR" | "PY";
export type EventType = "holiday" | "commercial";

export interface CalendarEvent {
  id: string;
  iso: string; // YYYY-MM-DD
  titlePt: string;
  titleEs: string;
  countries: EventCountry[];
  type: EventType;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, month1: number, day: number) => `${y}-${pad(month1)}-${pad(day)}`;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Gregorian Easter Sunday (Anonymous Computus). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoOf = (d: Date) => iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
const addDays = (d: Date, delta: number) => new Date(d.getTime() + delta * DAY_MS);

/** ISO of the nth (1-based) `weekday` (0=Sun..6=Sat) of `month0` (0-based). */
function nthWeekday(year: number, month0: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month0, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return iso(year, month0 + 1, 1 + offset + (n - 1) * 7);
}

type Spec = Omit<CalendarEvent, "id">;

/** All curated events for a single year. */
export function eventsForYear(year: number): CalendarEvent[] {
  const easter = easterSunday(year);
  const goodFriday = isoOf(addDays(easter, -2));
  const carnival = isoOf(addDays(easter, -47)); // Tuesday
  const corpusChristi = isoOf(addDays(easter, 60));
  const easterIso = isoOf(easter);

  // Black Friday: day after the 4th Thursday of November (US Thanksgiving).
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  const blackFriday = isoOf(addDays(new Date(`${thanksgiving}T00:00:00Z`), 1));
  const cyberMonday = isoOf(addDays(new Date(`${thanksgiving}T00:00:00Z`), 4));

  const specs: Spec[] = [
    // ---- Shared / movable ----
    {
      iso: iso(year, 1, 1),
      titlePt: "Ano Novo",
      titleEs: "Año Nuevo",
      countries: ["AR", "BR", "PY"],
      type: "holiday",
    },
    {
      iso: goodFriday,
      titlePt: "Sexta-feira Santa",
      titleEs: "Viernes Santo",
      countries: ["AR", "BR", "PY"],
      type: "holiday",
    },
    {
      iso: easterIso,
      titlePt: "Páscoa",
      titleEs: "Pascua",
      countries: ["AR", "BR", "PY"],
      type: "commercial",
    },
    {
      iso: carnival,
      titlePt: "Carnaval",
      titleEs: "Carnaval",
      countries: ["AR", "BR"],
      type: "holiday",
    },
    {
      iso: corpusChristi,
      titlePt: "Corpus Christi",
      titleEs: "Corpus Christi",
      countries: ["BR", "PY"],
      type: "holiday",
    },
    {
      iso: iso(year, 5, 1),
      titlePt: "Dia do Trabalho",
      titleEs: "Día del Trabajador",
      countries: ["AR", "BR", "PY"],
      type: "holiday",
    },
    {
      iso: iso(year, 12, 8),
      titlePt: "Imaculada Conceição",
      titleEs: "Inmaculada Concepción",
      countries: ["AR", "PY"],
      type: "holiday",
    },
    {
      iso: iso(year, 12, 25),
      titlePt: "Natal",
      titleEs: "Navidad",
      countries: ["AR", "BR", "PY"],
      type: "holiday",
    },

    // ---- Brazil ----
    {
      iso: iso(year, 4, 21),
      titlePt: "Tiradentes",
      titleEs: "Tiradentes",
      countries: ["BR"],
      type: "holiday",
    },
    {
      iso: iso(year, 9, 7),
      titlePt: "Independência do Brasil",
      titleEs: "Independencia de Brasil",
      countries: ["BR"],
      type: "holiday",
    },
    {
      iso: iso(year, 10, 12),
      titlePt: "Nossa Senhora Aparecida",
      titleEs: "Nuestra Señora Aparecida",
      countries: ["BR"],
      type: "holiday",
    },
    {
      iso: iso(year, 11, 2),
      titlePt: "Finados",
      titleEs: "Día de los Difuntos",
      countries: ["BR"],
      type: "holiday",
    },
    {
      iso: iso(year, 11, 15),
      titlePt: "Proclamação da República",
      titleEs: "Proclamación de la República",
      countries: ["BR"],
      type: "holiday",
    },
    {
      iso: iso(year, 11, 20),
      titlePt: "Consciência Negra",
      titleEs: "Conciencia Negra",
      countries: ["BR"],
      type: "holiday",
    },

    // ---- Argentina ----
    {
      iso: iso(year, 3, 24),
      titlePt: "Memória, Verdade e Justiça",
      titleEs: "Día de la Memoria",
      countries: ["AR"],
      type: "holiday",
    },
    {
      iso: iso(year, 4, 2),
      titlePt: "Veteranos e Caídos nas Malvinas",
      titleEs: "Día del Veterano (Malvinas)",
      countries: ["AR"],
      type: "holiday",
    },
    {
      iso: iso(year, 5, 25),
      titlePt: "Revolução de Maio",
      titleEs: "Revolución de Mayo",
      countries: ["AR"],
      type: "holiday",
    },
    {
      iso: iso(year, 6, 20),
      titlePt: "Dia da Bandeira (Belgrano)",
      titleEs: "Paso a la Inmortalidad de Belgrano",
      countries: ["AR"],
      type: "holiday",
    },
    {
      iso: iso(year, 7, 9),
      titlePt: "Independência da Argentina",
      titleEs: "Día de la Independencia",
      countries: ["AR"],
      type: "holiday",
    },
    {
      iso: iso(year, 8, 17),
      titlePt: "Gen. San Martín",
      titleEs: "Paso a la Inmortalidad de San Martín",
      countries: ["AR"],
      type: "holiday",
    },
    {
      iso: iso(year, 10, 12),
      titlePt: "Diversidade Cultural",
      titleEs: "Día del Respeto a la Diversidad Cultural",
      countries: ["AR"],
      type: "holiday",
    },
    {
      iso: iso(year, 11, 20),
      titlePt: "Soberania Nacional",
      titleEs: "Día de la Soberanía Nacional",
      countries: ["AR"],
      type: "holiday",
    },

    // ---- Paraguay ----
    {
      iso: iso(year, 3, 1),
      titlePt: "Dia dos Heróis",
      titleEs: "Día de los Héroes",
      countries: ["PY"],
      type: "holiday",
    },
    {
      iso: iso(year, 5, 14),
      titlePt: "Independência do Paraguai",
      titleEs: "Día de la Independencia",
      countries: ["PY"],
      type: "holiday",
    },
    {
      iso: iso(year, 5, 15),
      titlePt: "Independência do Paraguai (2º dia)",
      titleEs: "Independencia Nacional (2º día)",
      countries: ["PY"],
      type: "holiday",
    },
    {
      iso: iso(year, 6, 12),
      titlePt: "Paz do Chaco",
      titleEs: "Día de la Paz del Chaco",
      countries: ["PY"],
      type: "holiday",
    },
    {
      iso: iso(year, 8, 15),
      titlePt: "Fundação de Assunção",
      titleEs: "Fundación de Asunción",
      countries: ["PY"],
      type: "holiday",
    },
    {
      iso: iso(year, 9, 29),
      titlePt: "Batalha de Boquerón",
      titleEs: "Victoria de Boquerón",
      countries: ["PY"],
      type: "holiday",
    },
    {
      iso: iso(year, 12, 8),
      titlePt: "Virgem de Caacupé",
      titleEs: "Virgen de Caacupé",
      countries: ["PY"],
      type: "holiday",
    },

    // ---- Commercial / campaign dates ----
    {
      iso: iso(year, 2, 14),
      titlePt: "Dia dos Namorados (AR/PY)",
      titleEs: "San Valentín",
      countries: ["AR", "PY"],
      type: "commercial",
    },
    {
      iso: iso(year, 6, 12),
      titlePt: "Dia dos Namorados",
      titleEs: "Día de los Enamorados (BR)",
      countries: ["BR"],
      type: "commercial",
    },
    {
      iso: nthWeekday(year, 4, 0, 2),
      titlePt: "Dia das Mães",
      titleEs: "Día de la Madre (BR)",
      countries: ["BR"],
      type: "commercial",
    },
    {
      iso: iso(year, 5, 15),
      titlePt: "Dia das Mães (PY)",
      titleEs: "Día de la Madre",
      countries: ["PY"],
      type: "commercial",
    },
    {
      iso: nthWeekday(year, 9, 0, 3),
      titlePt: "Dia das Mães (AR)",
      titleEs: "Día de la Madre",
      countries: ["AR"],
      type: "commercial",
    },
    {
      iso: nthWeekday(year, 7, 0, 2),
      titlePt: "Dia dos Pais",
      titleEs: "Día del Padre (BR)",
      countries: ["BR"],
      type: "commercial",
    },
    {
      iso: nthWeekday(year, 5, 0, 3),
      titlePt: "Dia dos Pais (AR)",
      titleEs: "Día del Padre",
      countries: ["AR"],
      type: "commercial",
    },
    {
      iso: iso(year, 7, 20),
      titlePt: "Dia do Amigo",
      titleEs: "Día del Amigo",
      countries: ["AR"],
      type: "commercial",
    },
    {
      iso: iso(year, 9, 15),
      titlePt: "Dia do Cliente",
      titleEs: "Día del Cliente",
      countries: ["BR"],
      type: "commercial",
    },
    {
      iso: iso(year, 10, 12),
      titlePt: "Dia das Crianças",
      titleEs: "Día del Niño (BR)",
      countries: ["BR"],
      type: "commercial",
    },
    {
      iso: blackFriday,
      titlePt: "Black Friday",
      titleEs: "Black Friday",
      countries: ["AR", "BR", "PY"],
      type: "commercial",
    },
    {
      iso: cyberMonday,
      titlePt: "Cyber Monday",
      titleEs: "Cyber Monday",
      countries: ["AR", "BR", "PY"],
      type: "commercial",
    },
  ];

  return specs.map((spec) => ({ ...spec, id: `${spec.iso}-${slugify(spec.titleEs)}` }));
}

/**
 * Returns all events whose ISO date is within [startIso, endIso] (inclusive),
 * spanning every year the range touches.
 */
export function getEventsInRange(startIso: string, endIso: string): CalendarEvent[] {
  const startYear = Number(startIso.slice(0, 4));
  const endYear = Number(endIso.slice(0, 4));
  const events: CalendarEvent[] = [];
  for (let year = startYear; year <= endYear; year++) {
    for (const event of eventsForYear(year)) {
      if (event.iso >= startIso && event.iso <= endIso) events.push(event);
    }
  }
  return events.sort((a, b) => a.iso.localeCompare(b.iso));
}
