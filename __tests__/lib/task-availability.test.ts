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
    const w = availableTaskWhere({ now: AGORA });
    expect(w).toEqual({
      status: { notIn: ["OBSOLETE", "CANCELLED"] },
      OR: [{ plannedStartAt: null }, { plannedStartAt: { lte: AGORA } }],
    });
  });

  it("demanda obsoleta ou cancelada não é trabalho de ninguém", () => {
    // O botão "marcar obsoleta" promete que a demanda sai dos pendentes. Antes disto, só a
    // cobertura semanal cumpria: as etapas continuavam ACTIVE e com dono, e a demanda seguia
    // aparecendo no painel de quem a pegou como se fosse trabalho vivo.
    expect(availableTaskWhere({ now: AGORA }).status).toEqual({ notIn: ["OBSOLETE", "CANCELLED"] });
  });

  it("não impõe limite superior", () => {
    // Guarda estrutural contra a regressão mais provável: alguém "melhorar" o
    // filtro para uma janela e reintroduzir o sumiço do atrasado.
    // O tipo agora é `Prisma.TaskWhereInput`, em que `OR` é opcional — daí o cast.
    const or = availableTaskWhere({ now: AGORA }).OR as {
      plannedStartAt: Record<string, unknown>;
    }[];
    const cond = or[1].plannedStartAt;
    expect(cond).not.toHaveProperty("gte");
    expect(cond).not.toHaveProperty("gt");
  });

  it("o fragmento de etapa aninha o de tarefa", () => {
    // As telas de execução listam ETAPAS; a regra vive na tarefa. Derivar um do
    // outro impede que as duas versões divirjam.
    expect(availableStageWhere(AGORA)).toEqual({ task: availableTaskWhere({ now: AGORA }) });
  });
});

describe("exclusões extras (alsoExclude)", () => {
  it("soma o status extra aos descartados, em vez de substituí-los", () => {
    // A carga por cliente precisa tirar COMPLETED também — "Concluir demanda" marca o status sem
    // tocar nas etapas seguintes. Antes, a tela conseguia isso SOBRESCREVENDO a chave `status` do
    // fragmento: funcionava só porque a lista local era superconjunto da daqui. Um quarto status
    // descartado neste helper passaria a ser ignorado lá, EM SILÊNCIO.
    const w = availableTaskWhere({ alsoExclude: ["COMPLETED"] });
    expect(w.status).toEqual({ notIn: ["OBSOLETE", "CANCELLED", "COMPLETED"] });
  });

  it("o extra não mexe na outra metade da regra", () => {
    // Pedir uma exclusão a mais não pode, de tabela, apagar o filtro de início planejado.
    expect(availableTaskWhere({ now: AGORA, alsoExclude: ["COMPLETED"] }).OR).toEqual([
      { plannedStartAt: null },
      { plannedStartAt: { lte: AGORA } },
    ]);
  });

  it("sem opção nenhuma, é o fragmento de sempre", () => {
    expect(availableTaskWhere({ now: AGORA })).toEqual(
      availableTaskWhere({ now: AGORA, alsoExclude: [] })
    );
  });
});
