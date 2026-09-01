import { describe, it, expect } from "vitest";
import { projectDemandDays, type ProjectionStage } from "@/lib/planning/demand-projection";

const DIAS = [
  "2026-09-07", // segunda
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12", // sábado
];

function etapa(over: Partial<ProjectionStage> & { id: string }): ProjectionStage {
  return {
    stageId: over.id,
    order: 1,
    dependsOnIds: [],
    status: "INACTIVE",
    plannedDate: null,
    completedDay: null,
    pendingHours: 2,
    ...over,
  };
}

describe("projectDemandDays", () => {
  it("data humana manda — a projeção não decide onde alguém já decidiu", () => {
    const r = projectDemandDays({
      stages: [etapa({ id: "a", plannedDate: "2026-09-10" })],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("a")).toBe("2026-09-10");
  });

  it("a seguinte cai no dia POSTERIOR quando a anterior ainda não fechou", () => {
    // A etapa 2 não acontece junto da 1: acontece depois dela. É a razão desta função existir.
    const r = projectDemandDays({
      stages: [etapa({ id: "a", order: 1 }), etapa({ id: "b", order: 2, dependsOnIds: ["a"] })],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("a")).toBe("2026-09-07");
    expect(r.get("b")).toBe("2026-09-08");
  });

  it("anterior CONCLUÍDA libera o mesmo dia", () => {
    // Quem terminou às 10h não impede a etapa seguinte de acontecer às 14h.
    const r = projectDemandDays({
      stages: [
        etapa({
          id: "a",
          order: 1,
          status: "COMPLETED",
          completedDay: "2026-09-09",
          pendingHours: 0,
        }),
        etapa({ id: "b", order: 2, dependsOnIds: ["a"] }),
      ],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    // A concluída não tem pendente para posicionar.
    expect(r.get("a")).toBeNull();
    expect(r.get("b")).toBe("2026-09-09");
  });

  it("etapas paralelas caem no mesmo dia", () => {
    // Duas que dependem da mesma anterior são paralelas — é isso que paralelo quer dizer.
    const r = projectDemandDays({
      stages: [
        etapa({ id: "a", order: 1 }),
        etapa({ id: "b", order: 2, dependsOnIds: ["a"] }),
        etapa({ id: "c", order: 3, dependsOnIds: ["a"] }),
      ],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("b")).toBe("2026-09-08");
    expect(r.get("c")).toBe("2026-09-08");
  });

  it("etapa de 0h não empurra ninguém", () => {
    // Sem duração conhecida, afirmar que ela consome um dia seria inventar.
    const r = projectDemandDays({
      stages: [
        etapa({ id: "a", order: 1, pendingHours: 0 }),
        etapa({ id: "b", order: 2, dependsOnIds: ["a"] }),
      ],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("a")).toBe("2026-09-07");
    expect(r.get("b")).toBe("2026-09-07");
  });

  it("o vencimento é a parede: tudo empilha na VÉSPERA", () => {
    // Vence quinta (10), então o trabalho precisa estar pronto na quarta (09).
    const r = projectDemandDays({
      stages: [
        etapa({ id: "a", order: 1 }),
        etapa({ id: "b", order: 2, dependsOnIds: ["a"] }),
        etapa({ id: "c", order: 3, dependsOnIds: ["b"] }),
        etapa({ id: "d", order: 4, dependsOnIds: ["c"] }),
      ],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: "2026-09-10",
    });
    expect(r.get("a")).toBe("2026-09-07");
    expect(r.get("b")).toBe("2026-09-08");
    expect(r.get("c")).toBe("2026-09-09");
    // A quarta seria sexta pela cascata; a parede a traz para a véspera.
    expect(r.get("d")).toBe("2026-09-09");
  });

  it("demanda VENCIDA empilha em hoje — não há para onde adiar", () => {
    const r = projectDemandDays({
      stages: [etapa({ id: "a", order: 1 }), etapa({ id: "b", order: 2, dependsOnIds: ["a"] })],
      days: DIAS,
      todayISO: "2026-09-09",
      dueDateISO: "2026-09-04",
    });
    expect(r.get("a")).toBe("2026-09-09");
    expect(r.get("b")).toBe("2026-09-09");
  });

  it("demanda que vence HOJE também empilha em hoje", () => {
    // A véspera já passou; o último dia que existe é hoje.
    const r = projectDemandDays({
      stages: [etapa({ id: "a" })],
      days: DIAS,
      todayISO: "2026-09-09",
      dueDateISO: "2026-09-09",
    });
    expect(r.get("a")).toBe("2026-09-09");
  });

  it("sem prazo, o que passa do sábado não aparece nesta semana", () => {
    // Empilhar no sábado o trabalho que não é dele mentiria sobre a carga do dia.
    const stages = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
      etapa({ id: `s${n}`, order: n, dependsOnIds: n === 1 ? [] : [`s${n - 1}`] })
    );
    const r = projectDemandDays({
      stages,
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("s6")).toBe("2026-09-12");
    expect(r.get("s7")).toBeNull();
    expect(r.get("s8")).toBeNull();
  });

  it("etapa atrasada entra no primeiro dia visível", () => {
    // Mesma regra do resto do sistema: sumir da tela é a pior perda, porque é silenciosa.
    const r = projectDemandDays({
      stages: [etapa({ id: "a", plannedDate: "2026-08-31" })],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("a")).toBe("2026-09-07");
  });

  it("fora da semana corrente, a cascata parte do primeiro dia visível", () => {
    // Semana futura: `todayISO` é nulo porque hoje não está na janela.
    const r = projectDemandDays({
      stages: [etapa({ id: "a", order: 1 }), etapa({ id: "b", order: 2, dependsOnIds: ["a"] })],
      days: DIAS,
      todayISO: null,
      dueDateISO: null,
    });
    expect(r.get("a")).toBe("2026-09-07");
    expect(r.get("b")).toBe("2026-09-08");
  });

  it("dependência de etapa que não faz parte da demanda é ignorada", () => {
    // Etapa desmarcada na criação não tem linha; tratá-la como pendência travaria a cadeia inteira.
    const r = projectDemandDays({
      stages: [etapa({ id: "b", order: 2, dependsOnIds: ["fora"] })],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("b")).toBe("2026-09-07");
  });

  it("ordem 1 dependendo de ordem 5 é posicionada DEPOIS da 5", () => {
    // A order não é topológica: o sistema permite dependências para trás.
    // O algoritmo deve resolvê-las em profundidade, não por order.
    const r = projectDemandDays({
      stages: [etapa({ id: "a", order: 5 }), etapa({ id: "b", order: 1, dependsOnIds: ["a"] })],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    expect(r.get("a")).toBe("2026-09-07");
    expect(r.get("b")).toBe("2026-09-08");
  });

  it("ciclo entre duas etapas não trava a função", () => {
    // A → B → A: a segunda visita a A detecta o ciclo, posiciona em âncora e sai.
    const r = projectDemandDays({
      stages: [
        etapa({ id: "a", order: 1, dependsOnIds: ["b"] }),
        etapa({ id: "b", order: 2, dependsOnIds: ["a"] }),
      ],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    // Ambas em ciclo caem na âncora.
    expect(r.get("a")).toBe("2026-09-07");
    expect(r.get("b")).toBe("2026-09-07");
  });

  it("ordem 1 dependendo de ordem 5 COMPLETED cai no dia da conclusão", () => {
    // Dependência para trás sobre concluída: b (order 1) depende de a (order 5, COMPLETED).
    // Quando b chama obterDia("a") via recursão, a ainda não foi processada no laço externo,
    // mas obterDia deve reconhecê-la como COMPLETED e devolver completedDay, não fabricar data.
    const r = projectDemandDays({
      stages: [
        etapa({
          id: "a",
          order: 5,
          status: "COMPLETED",
          completedDay: "2026-09-09",
          pendingHours: 0,
        }),
        etapa({ id: "b", order: 1, dependsOnIds: ["a"] }),
      ],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: null,
    });
    // a é concluída, não aparece no resultado.
    expect(r.get("a")).toBeNull();
    // b depende da conclusão de a; libera o mesmo dia da conclusão.
    expect(r.get("b")).toBe("2026-09-09");
  });

  it("demanda VENCIDA: data humana não é puxada para hoje pela parede", () => {
    // Vence em 2026-09-04 (quinta passada). Parede = 2026-09-07 (segunda, hoje).
    // Uma etapa com plannedDate em 2026-09-08 deve ficar em 2026-09-08, não ser puxada para hoje.
    const r = projectDemandDays({
      stages: [etapa({ id: "a", plannedDate: "2026-09-08" })],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: "2026-09-04",
    });
    // Data humana manda: fica onde foi posta.
    expect(r.get("a")).toBe("2026-09-08");
  });

  it("demanda VENCIDA: sem plannedDate, a parede continua valendo", () => {
    // Mesma demanda: ordem 1 sem plannedDate deve cair na parede (hoje).
    const r = projectDemandDays({
      stages: [etapa({ id: "a", order: 1 })],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: "2026-09-04",
    });
    // Sem data humana, cascata caiu na parede.
    expect(r.get("a")).toBe("2026-09-07");
  });

  it("a parede comprime a cascata, mas não empurra a dependente para antes da dependência", () => {
    // a tem plannedDate além da parede — fica onde o gestor pôs (regra já coberta acima).
    // b depende de a e não tem data: a cascata a posicionaria depois de a (09-12); a parede
    // (vencimento em 09-10, véspera 09-09) tentaria puxá-la para 09-09 — antes de a. O piso que
    // a depende ela impõe (o próprio dia de a, 09-11) impede essa inversão: a parede comprime até
    // aí e para, porque comprimir não é inverter.
    const r = projectDemandDays({
      stages: [
        etapa({ id: "a", order: 1, plannedDate: "2026-09-11" }),
        etapa({ id: "b", order: 2, dependsOnIds: ["a"] }),
      ],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: "2026-09-10",
    });
    expect(r.get("a")).toBe("2026-09-11");
    // b não fica antes de a — na pior compressão, fica ao lado dela, nunca antes.
    expect(r.get("b")).toBe("2026-09-11");
    expect(r.get("b")! >= r.get("a")!).toBe(true);
  });

  it("a parede continua comprimindo a cadeia pura, sem nenhuma data humana envolvida", () => {
    // Mesmo caso da cadeia pura já coberto acima ("o vencimento é a parede..."), reafirmado aqui
    // como salvaguarda direta do defeito: a correção do piso não pode reintroduzir a régua antiga
    // (tudo empatando na véspera) nem parar de comprimir quando não há decisão humana no meio.
    const r = projectDemandDays({
      stages: [
        etapa({ id: "a", order: 1 }),
        etapa({ id: "b", order: 2, dependsOnIds: ["a"] }),
        etapa({ id: "c", order: 3, dependsOnIds: ["b"] }),
        etapa({ id: "d", order: 4, dependsOnIds: ["c"] }),
      ],
      days: DIAS,
      todayISO: "2026-09-07",
      dueDateISO: "2026-09-10",
    });
    expect(r.get("a")).toBe("2026-09-07");
    expect(r.get("b")).toBe("2026-09-08");
    expect(r.get("c")).toBe("2026-09-09");
    // A cascata pura levaria d a 09-11; a parede (véspera 09-09) comprime até lá.
    expect(r.get("d")).toBe("2026-09-09");
  });
});
