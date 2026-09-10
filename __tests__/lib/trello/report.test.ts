import { describe, expect, it } from "vitest";
import { formatReport, formatWriteResult } from "@/lib/trello/report";
import type { ImportPlan, PlannedTask, SkippedCard } from "@/lib/trello/plan";
import type { ExportCard, TrelloMember } from "@/lib/trello/types";
import type { ImportReport } from "@/lib/trello/writer";

/** Card mínimo — formatReport só olha para o total de itens e o motivo do descarte, nunca para os
 * campos do card em si, então os valores aqui são só para satisfazer o tipo. */
function card(id: string): ExportCard {
  return { id, name: `Card ${id}` };
}

function plannedTask(id: string, monthKey: string): PlannedTask {
  return {
    card: card(id),
    monthKey,
    title: `Demanda ${id}`,
    description: "",
    dueDate: null,
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    completedAt: null,
    stages: [],
    rework: [],
  };
}

function skipped(id: string, reason: SkippedCard["reason"]): SkippedCard {
  return { card: card(id), reason };
}

function member(id: string, fullName: string): TrelloMember {
  return { id, username: id, fullName };
}

/** Plano sintético com a mesma FORMA do plano real (dois meses, cinco motivos de descarte, gente
 * de repescagem) — não os números reais (204/99/17), que pertencem ao ensaio contra o export
 * verdadeiro, não a um teste unitário. */
const PLAN: ImportPlan = {
  projects: [
    { monthKey: "2025-05", name: "AtlanticoShop 2025-05", clientId: "c1" },
    { monthKey: "2025-06", name: "AtlanticoShop 2025-06", clientId: "c1" },
  ],
  tasks: [plannedTask("t1", "2025-05"), plannedTask("t2", "2025-06")],
  skipped: [
    skipped("s1", "separador"),
    skipped("s2", "separador"),
    skipped("s3", "separador"),
    skipped("s4", "ausencia"),
    skipped("s5", "referencia"),
    skipped("s6", "sem etapa mapeável"),
    skipped("s7", "sem etapa mapeável"),
  ],
  unmatchedPeople: [member("m1", "Fulano Trello"), member("m2", "Beltrana Trello")],
};

describe("formatReport", () => {
  it("o relatório diz o que entra, o que fica de fora e por quê", () => {
    const txt = formatReport(PLAN, 9);

    expect(txt).toContain("2 demandas");
    expect(txt).toContain("2 projetos");
    expect(txt).toMatch(/separador:\s*3/);
    expect(txt).toMatch(/ausencia:\s*1/);
    expect(txt).toMatch(/referencia:\s*1/);
    expect(txt).toMatch(/sem etapa mapeável:\s*2/);
    expect(txt).toContain("repescagem manual");
    expect(txt).toContain("Fulano Trello");
    expect(txt).toContain("Beltrana Trello");
  });

  it("confere a soma contra o total de cards e não acusa divergência quando bate", () => {
    const txt = formatReport(PLAN, 9);
    expect(txt).not.toMatch(/diverg[êe]ncia/i);
  });

  it("acusa divergência quando a soma não bate com o total de cards", () => {
    const txt = formatReport(PLAN, 10);
    expect(txt).toMatch(/diverg[êe]ncia/i);
  });

  it("relata quando não há ninguém para repescagem", () => {
    const semRepescagem: ImportPlan = { ...PLAN, unmatchedPeople: [] };
    const txt = formatReport(semRepescagem, 9);
    expect(txt).toContain("repescagem manual");
    expect(txt).toMatch(/nenhum/i);
  });
});

describe("formatWriteResult", () => {
  const REPORT: ImportReport = {
    commit: true,
    projectsCreated: 3,
    projectsReused: 1,
    tasksCreated: 204,
    skippedAlreadyImported: 5,
    artifactsCreated: 120,
    reworkEventsCreated: 8,
    failedMonths: [],
  };

  it("mostra os contadores da gravação", () => {
    const txt = formatWriteResult(REPORT);
    expect(txt).toContain("projetos criados: 3");
    expect(txt).toContain("reaproveitados");
    expect(txt).toContain("1");
    expect(txt).toContain("demandas criadas: 204");
    expect(txt).toContain("5");
    expect(txt).toContain("artefatos criados: 120");
    expect(txt).toContain("eventos de retrabalho criados: 8");
    expect(txt).toMatch(/nenhum mês falhou/i);
  });

  it("lista os meses que falharam quando há falha", () => {
    const comFalha: ImportReport = {
      ...REPORT,
      failedMonths: [{ monthKey: "2025-07", error: "boom" }],
    };
    const txt = formatWriteResult(comFalha);
    expect(txt).toContain("2025-07");
    expect(txt).toContain("boom");
    expect(txt).not.toMatch(/nenhum mês falhou/i);
  });
});
