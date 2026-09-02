import { describe, it, expect } from "vitest";
import {
  occupiedRange,
  rangesOverlap,
  collidingWith,
  canOverride,
  firstFreeStart,
} from "@/lib/planning/stage-window";
import type { Range } from "@/lib/planning/stage-window";
import type { TaskPriority } from "@prisma/client";

const AS_14H = new Date("2026-09-04T17:00:00.000Z"); // 14h em São Paulo

describe("occupiedRange", () => {
  it("sem hora marcada, não ocupa nada", () => {
    // Item da fila normal: quem manda nele é a ordem manual, não o relógio.
    expect(
      occupiedRange({ scheduledStart: null, scheduledEnd: null, referenceHours: 3 })
    ).toBeNull();
  });

  it("com fim declarado, o compromisso manda", () => {
    // A locação vai das 14h às 16h. A referência da etapa (3h) não tem voto: o que foi combinado
    // com o estúdio é o que ocupa a agenda.
    const r = occupiedRange({
      scheduledStart: AS_14H,
      scheduledEnd: new Date("2026-09-04T19:00:00.000Z"),
      referenceHours: 3,
    });
    expect(r).toEqual({ start: AS_14H, end: new Date("2026-09-04T19:00:00.000Z") });
  });

  it("sem fim declarado, a faixa é o range estimado da etapa", () => {
    const r = occupiedRange({ scheduledStart: AS_14H, scheduledEnd: null, referenceHours: 3 });
    expect(r?.end).toEqual(new Date("2026-09-04T20:00:00.000Z")); // 14h + 3h
  });

  it("etapa sem referência nenhuma ocupa 1h por convenção", () => {
    // Faixa de duração zero não colidiria com nada e a trava inteira viraria decorativa.
    const r = occupiedRange({ scheduledStart: AS_14H, scheduledEnd: null, referenceHours: 0 });
    expect(r?.end).toEqual(new Date("2026-09-04T18:00:00.000Z")); // 14h + 1h
  });
});

const faixa = (deISO: string, ateISO: string): Range => ({
  start: new Date(deISO),
  end: new Date(ateISO),
});

describe("rangesOverlap", () => {
  it("encostar não é colidir", () => {
    // 14h–16h e 16h–17h convivem: a segunda começa quando a primeira acaba. Tratar a borda como
    // colisão proibiria a agenda cheia e legítima — dois compromissos em sequência.
    const a = faixa("2026-09-04T17:00:00Z", "2026-09-04T19:00:00Z");
    const b = faixa("2026-09-04T19:00:00Z", "2026-09-04T20:00:00Z");
    expect(rangesOverlap(a, b)).toBe(false);
    expect(rangesOverlap(b, a)).toBe(false);
  });

  it("um minuto de invasão já é colisão", () => {
    const a = faixa("2026-09-04T17:00:00Z", "2026-09-04T19:00:00Z");
    const b = faixa("2026-09-04T18:59:00Z", "2026-09-04T20:00:00Z");
    expect(rangesOverlap(a, b)).toBe(true);
  });

  it("faixa contida dentro da outra colide", () => {
    const a = faixa("2026-09-04T17:00:00Z", "2026-09-04T21:00:00Z");
    const b = faixa("2026-09-04T18:00:00Z", "2026-09-04T19:00:00Z");
    expect(rangesOverlap(a, b)).toBe(true);
  });
});

describe("collidingWith", () => {
  it("devolve só quem está no caminho, preservando o objeto de origem", () => {
    // O chamador precisa saber QUEM colide (demanda, etapa, prioridade), não só que colide.
    const nova = faixa("2026-09-04T17:00:00Z", "2026-09-04T19:00:00Z");
    const ocupadas = [
      { id: "a", range: faixa("2026-09-04T13:00:00Z", "2026-09-04T15:00:00Z") },
      { id: "b", range: faixa("2026-09-04T18:00:00Z", "2026-09-04T20:00:00Z") },
      { id: "c", range: faixa("2026-09-04T19:00:00Z", "2026-09-04T21:00:00Z") },
    ];
    expect(collidingWith(nova, ocupadas).map((o) => o.id)).toEqual(["b"]);
  });
});

describe("canOverride", () => {
  it("prioridade maior ocupa o horário", () => {
    expect(canOverride("HIGH", "MEDIUM")).toBe(true);
    expect(canOverride("MEDIUM", "LOW")).toBe(true);
    expect(canOverride("URGENT", "HIGH")).toBe(true);
  });

  it("menor ou igual não ocupa", () => {
    // Empate não passa: sem uma diferença declarada por quem classificou as duas demandas, o
    // sistema não tem critério — e inventar um seria decidir no lugar do gestor.
    expect(canOverride("LOW", "HIGH")).toBe(false);
    expect(canOverride("MEDIUM", "MEDIUM")).toBe(false);
    expect(canOverride("HIGH", "HIGH")).toBe(false);
  });

  it("urgente contra urgente PASSA — é o único efeito da segunda metade da regra", () => {
    // `URGENT` já é o topo do enum, então "maior que a ocupante" nunca autorizaria este caso.
    // A regra tem duas metades exatamente para ele: duas urgentes, e o desempate é de quem
    // classificou as duas como urgentes.
    expect(canOverride("URGENT", "URGENT")).toBe(true);
  });
});

const H = 3_600_000;

describe("firstFreeStart", () => {
  it("sem nada no caminho, é o próprio instante", () => {
    const desde = new Date("2026-09-04T19:00:00Z");
    expect(firstFreeStart(desde, 2 * H, [])).toEqual(desde);
  });

  it("pula uma terceira janela que estava no meio", () => {
    // Adiar a ocupante não pode trocar uma colisão por outra: se às 16h já existe outro
    // compromisso, o "primeiro livre" é depois DELE.
    const desde = new Date("2026-09-04T19:00:00Z"); // 16h SP
    const ocupadas = [
      { start: new Date("2026-09-04T19:00:00Z"), end: new Date("2026-09-04T20:00:00Z") },
    ];
    expect(firstFreeStart(desde, 2 * H, ocupadas)).toEqual(new Date("2026-09-04T20:00:00Z"));
  });

  it("pula janelas encadeadas, uma atrás da outra", () => {
    const desde = new Date("2026-09-04T19:00:00Z");
    const ocupadas = [
      { start: new Date("2026-09-04T20:00:00Z"), end: new Date("2026-09-04T21:00:00Z") },
      { start: new Date("2026-09-04T19:00:00Z"), end: new Date("2026-09-04T20:00:00Z") },
    ];
    // Fora de ordem de propósito: quem chama monta a lista pela consulta, não ordenada.
    expect(firstFreeStart(desde, H, ocupadas)).toEqual(new Date("2026-09-04T21:00:00Z"));
  });
});
