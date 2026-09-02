import { describe, it, expect } from "vitest";
import { buildInstructionComments } from "@/lib/stage-instruction";

const BASE = {
  taskId: "t1",
  createdById: "gestor1",
  ativadas: [
    { activeStageId: "as2", instructions: "Gravar no estúdio B" },
    { activeStageId: "as3", instructions: null },
  ],
};

describe("buildInstructionComments", () => {
  it("uma instrução vira um comentário assinado por quem criou a demanda", () => {
    // Independente de quem executa a etapa: quem escreveu o direcionamento foi o gestor da criação.
    expect(buildInstructionComments(BASE)).toEqual([
      {
        taskId: "t1",
        userId: "gestor1",
        activeStageId: "as2",
        kind: "STAGE_INSTRUCTION",
        content: "Gravar no estúdio B",
      },
    ]);
  });

  it("etapa sem instrução não gera comentário", () => {
    // Não há texto a entregar, e um marco vazio precisaria de um autor que ninguém escreveu.
    expect(buildInstructionComments({ ...BASE, ativadas: [BASE.ativadas[1]] })).toEqual([]);
  });

  it("demanda sem criador registrado não gera nada", () => {
    // Demanda anterior a esta entrega. Sem autor conhecido, assinar em nome de alguém seria
    // inventar — e a instrução continua aparecendo nos três lugares onde já aparecia.
    expect(buildInstructionComments({ ...BASE, createdById: null })).toEqual([]);
  });

  it("instrução só de espaços conta como ausente", () => {
    expect(
      buildInstructionComments({
        ...BASE,
        ativadas: [{ activeStageId: "as2", instructions: "   " }],
      })
    ).toEqual([]);
  });
});
