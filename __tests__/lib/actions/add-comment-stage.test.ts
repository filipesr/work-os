import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `addComment` é o que substitui a regra de desempate por autor no modal de histórico: a etapa não
 * é mais adivinhada, ela é informada por quem escreve. `kind` continua cravado no servidor — só
 * verificamos aqui que nenhum parâmetro externo consegue virar `STAGE_INSTRUCTION`.
 */

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn().mockResolvedValue({ id: "u1", role: "MEMBER", email: "u1@b.c" }),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    taskComment: {
      create: vi.fn().mockResolvedValue({ id: "c1" }),
    },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { addComment } from "@/lib/actions/task";

const db = prisma as unknown as {
  taskComment: { create: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  db.taskComment.create.mockResolvedValue({ id: "c1" });
});

describe("addComment", () => {
  it("guarda a etapa quando ela é informada", async () => {
    // É o que substitui TODA a regra de desempate: quem escreve na tela da etapa está dizendo de
    // qual etapa fala, e o servidor só registra o que a tela já sabe.
    await addComment("t1", "faltou o off", "as9");
    expect(db.taskComment.create.mock.calls[0][0].data).toMatchObject({
      taskId: "t1",
      activeStageId: "as9",
      kind: "USER",
    });
  });

  it("sem etapa informada, grava nulo — é conversa da demanda", async () => {
    // "O cliente adiou tudo" não é de etapa nenhuma. Forçar uma escolha aqui seria o mesmo chute
    // que esta entrega remove, feito pela pessoa em vez do código.
    await addComment("t1", "cliente adiou tudo");
    expect(db.taskComment.create.mock.calls[0][0].data.activeStageId).toBeNull();
  });

  it("comentário de gente é sempre USER — o tipo não vem de fora", async () => {
    // `kind` decide o que é editável e o que tem título de instrução. Aceitá-lo por parâmetro
    // deixaria a tela forjar uma instrução assinada por quem ela quisesse.
    await addComment("t1", "oi", "as9");
    expect(db.taskComment.create.mock.calls[0][0].data.kind).toBe("USER");
  });
});
