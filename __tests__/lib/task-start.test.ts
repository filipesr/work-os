import { describe, it, expect, vi, beforeEach } from "vitest";
import { markTaskStarted } from "@/lib/task-start";

// Writer mínimo aceito por markTaskStarted (PrismaClient ou transação).
const makeClient = () => ({ task: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } });

describe("markTaskStarted", () => {
  beforeEach(() => vi.clearAllMocks());

  it("carimba startedAt com compare-and-set atômico (where startedAt: null)", async () => {
    const client = makeClient();
    await markTaskStarted(client as never, "task-1");

    expect(client.task.updateMany).toHaveBeenCalledTimes(1);
    const arg = client.task.updateMany.mock.calls[0][0];

    // O `startedAt: null` no WHERE é o que torna o carimbo write-once: a segunda
    // promoção casa com zero linhas. Sem ele, um `update` sobrescreveria o
    // início a cada re-promoção (inclusive após uma reversão), zerando o cycle
    // time de tarefas que sofreram retrabalho — o oposto do correto.
    expect(arg.where).toEqual({ id: "task-1", startedAt: null });
    expect(arg.data.startedAt).toBeInstanceOf(Date);
  });

  it("nunca sobrescreve: a linha já carimbada não casa com o where", async () => {
    // Simula o banco: a 2ª chamada não encontra linha com startedAt null.
    const client = makeClient();
    client.task.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await markTaskStarted(client as never, "task-1");
    await markTaskStarted(client as never, "task-1");

    // Toda chamada carrega a mesma guarda — a idempotência vem do WHERE, não de
    // uma leitura prévia (que seria uma corrida sob dois claims simultâneos).
    for (const call of client.task.updateMany.mock.calls) {
      expect(call[0].where.startedAt).toBeNull();
    }
  });

  it("aceita uma transação como client (mesmo contrato do PrismaClient)", async () => {
    const tx = makeClient();
    await markTaskStarted(tx as never, "task-2");
    expect(tx.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "task-2", startedAt: null } })
    );
  });
});
