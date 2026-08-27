import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  // A ação devolve a CHAVE como mensagem; o teste afirma o motivo, não o texto.
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({ requireManagerOrAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { reworkEvent: { update: vi.fn().mockResolvedValue({}) } },
  prisma: {},
}));
import prisma from "@/lib/prisma";
import { classifyReworkEvent } from "@/lib/actions/rework-classify";
const db = prisma as unknown as { reworkEvent: { update: ReturnType<typeof vi.fn> } };

describe("classifyReworkEvent", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejeita classe inválida sem tocar o banco", async () => {
    const res = await classifyReworkEvent("r1", "BOGUS" as never);
    expect(res).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(db.reworkEvent.update).not.toHaveBeenCalled();
  });
  it("grava a classe", async () => {
    await classifyReworkEvent("r1", "LEGITIMATE");
    expect(db.reworkEvent.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { reworkClass: "LEGITIMATE" },
    });
  });
});
