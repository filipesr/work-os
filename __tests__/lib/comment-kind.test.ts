import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** O schema é a fonte da verdade destas três colunas, e elas são o alicerce de todo o resto do
 *  plano. Um teste que lê o schema parece rodeio, mas é a única forma de falhar CEDO se alguém
 *  aplicar a migração sem atualizar o modelo (ou o contrário) — o Prisma Client só reclamaria em
 *  runtime, na primeira demanda com instrução. */
describe("modelo do comentário de etapa", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");

  it("o comentário aponta para a INSTÂNCIA da etapa, e o vínculo é opcional", () => {
    // Instância, não etapa do template: quando a demanda puder ter duas "Gravação", o template não
    // saberia de qual delas é o comentário. Opcional porque nem toda conversa é de etapa.
    expect(schema).toMatch(/activeStageId\s+String\?/);
    expect(schema).toMatch(/activeStage\s+TaskActiveStage\?/);
  });

  it("o tipo do comentário distingue conversa de instrução", () => {
    expect(schema).toMatch(/enum CommentKind \{[^}]*USER[^}]*STAGE_INSTRUCTION[^}]*\}/);
    expect(schema).toMatch(/kind\s+CommentKind\s+@default\(USER\)/);
  });

  it("a demanda passa a guardar quem a criou", () => {
    // O sistema não guardava isto: `Task` tinha título, prazo, projeto e template, e nenhum autor.
    expect(schema).toMatch(/createdById\s+String\?/);
  });
});
