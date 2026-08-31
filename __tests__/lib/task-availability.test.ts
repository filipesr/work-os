import { describe, expect, it } from "vitest";

import {
  availableStageWhere,
  availableTaskWhere,
  isAvailableForExecution,
} from "@/lib/task-availability";

const AGORA = new Date("2026-11-20T10:00:00Z");
const dias = (n: number) => new Date(AGORA.getTime() + n * 8.64e7);

describe("isAvailableForExecution", () => {
  it("esconde o que ainda não chegou a hora", () => {
    // Uma demanda planejada para daqui a duas semanas não é trabalho de hoje.
    // Deixá-la na fila puxaria alguém a começar cedo, gastando a folga que
    // existe justamente para absorver imprevisto.
    expect(isAvailableForExecution(dias(14), AGORA)).toBe(false);
    expect(isAvailableForExecution(dias(1), AGORA)).toBe(false);
  });

  it("aparece a partir da data de início", () => {
    expect(isAvailableForExecution(AGORA, AGORA)).toBe(true);
    expect(isAvailableForExecution(dias(-1), AGORA)).toBe(true);
  });

  it("NUNCA some depois — nem muito depois", () => {
    // A metade da regra que é fácil errar. Uma demanda que já deveria ter
    // começado e não começou é a que mais precisa ser vista; um filtro de
    // janela (entre início e prazo) a esconderia exatamente quando importa.
    expect(isAvailableForExecution(dias(-30), AGORA)).toBe(true);
    expect(isAvailableForExecution(dias(-365), AGORA)).toBe(true);
  });

  it("sem início planejado, sempre disponível", () => {
    // Demandas criadas antes deste conceito, ou sem passar pelo planejamento,
    // não podem desaparecer.
    expect(isAvailableForExecution(null, AGORA)).toBe(true);
    expect(isAvailableForExecution(undefined, AGORA)).toBe(true);
  });
});

describe("fragmentos de where", () => {
  it("aceita nulo OU início já alcançado, e exclui demanda descartada", () => {
    const w = availableTaskWhere(AGORA);
    expect(w).toEqual({
      status: { notIn: ["OBSOLETE", "CANCELLED"] },
      OR: [{ plannedStartAt: null }, { plannedStartAt: { lte: AGORA } }],
    });
  });

  it("demanda obsoleta ou cancelada não é trabalho de ninguém", () => {
    // O botão "marcar obsoleta" promete que a demanda sai dos pendentes. Antes disto, só a
    // cobertura semanal cumpria: as etapas continuavam ACTIVE e com dono, e a demanda seguia
    // aparecendo no painel de quem a pegou como se fosse trabalho vivo.
    expect(availableTaskWhere(AGORA).status).toEqual({ notIn: ["OBSOLETE", "CANCELLED"] });
  });

  it("não impõe limite superior", () => {
    // Guarda estrutural contra a regressão mais provável: alguém "melhorar" o
    // filtro para uma janela e reintroduzir o sumiço do atrasado.
    // O tipo agora é `Prisma.TaskWhereInput`, em que `OR` é opcional — daí o cast.
    const or = availableTaskWhere(AGORA).OR as { plannedStartAt: Record<string, unknown> }[];
    const cond = or[1].plannedStartAt;
    expect(cond).not.toHaveProperty("gte");
    expect(cond).not.toHaveProperty("gt");
  });

  it("o fragmento de etapa aninha o de tarefa", () => {
    // As telas de execução listam ETAPAS; a regra vive na tarefa. Derivar um do
    // outro impede que as duas versões divirjam.
    expect(availableStageWhere(AGORA)).toEqual({ task: availableTaskWhere(AGORA) });
  });
});
