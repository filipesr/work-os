import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock("@/lib/permissions", () => ({ requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

vi.mock("@/lib/prisma", () => ({
  default: {
    workflowTemplate: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    templateStage: {
      count: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "s1" }),
      delete: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
    },
    stageDependency: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn() },
  },
  prisma: {},
}));

import prisma from "@/lib/prisma";
import { updateWorkflowTemplate } from "@/lib/actions/template";
import { createTemplateStage, deleteTemplateStage } from "@/lib/actions/stage";

const db = prisma as unknown as {
  workflowTemplate: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  templateStage: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

function templateForm(fields: Record<string, string>) {
  const fd = new FormData();
  fd.append("name", "Story de loja");
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

function stageForm() {
  const fd = new FormData();
  fd.append("name", "Execução");
  fd.append("order", "1");
  fd.append("expectedDurationHours", "1");
  return fd;
}

describe("updateWorkflowTemplate — marca de fluxo rápido", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aceita marcar quando o template tem uma etapa só", async () => {
    db.templateStage.count.mockResolvedValue(1);
    const res = await updateWorkflowTemplate("tpl", templateForm({ quickEntry: "on" }));
    expect(res).toEqual(expect.objectContaining({ success: true }));
    expect(db.workflowTemplate.update.mock.calls[0][0].data.quickEntry).toBe(true);
  });

  it("recusa marcar com duas etapas, sem escrever nada", async () => {
    db.templateStage.count.mockResolvedValue(2);
    const res = await updateWorkflowTemplate("tpl", templateForm({ quickEntry: "on" }));
    expect(res).toEqual({ error: "quickNeedsSingleStage" });
    expect(db.workflowTemplate.update).not.toHaveBeenCalled();
  });

  it("desmarcar é sempre permitido — é a saída para poder crescer o fluxo", async () => {
    db.templateStage.count.mockResolvedValue(1);
    const res = await updateWorkflowTemplate("tpl", templateForm({}));
    expect(res).toEqual(expect.objectContaining({ success: true }));
    expect(db.workflowTemplate.update.mock.calls[0][0].data.quickEntry).toBe(false);
  });
});

describe("createTemplateStage — não cresce fluxo rápido", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recusa a segunda etapa num fluxo rápido", async () => {
    db.workflowTemplate.findUnique.mockResolvedValue({ quickEntry: true });
    db.templateStage.count.mockResolvedValue(1);
    const res = await createTemplateStage("tpl", stageForm());
    expect(res).toEqual({ error: "quickCannotAddStage" });
    expect(db.templateStage.create).not.toHaveBeenCalled();
  });

  it("aceita etapa em fluxo normal", async () => {
    db.workflowTemplate.findUnique.mockResolvedValue({ quickEntry: false });
    db.templateStage.count.mockResolvedValue(3);
    const res = await createTemplateStage("tpl", stageForm());
    expect(res).toEqual(expect.objectContaining({ success: true }));
  });
});

describe("deleteTemplateStage — nunca deixa o template vazio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recusa apagar a última etapa", async () => {
    db.templateStage.count.mockResolvedValue(1);
    const res = await deleteTemplateStage("s1", "tpl");
    expect(res).toEqual({ error: "lastStageCannotBeDeleted" });
    expect(db.templateStage.delete).not.toHaveBeenCalled();
  });

  it("permite quando sobra etapa", async () => {
    db.templateStage.count.mockResolvedValue(2);
    const res = await deleteTemplateStage("s1", "tpl");
    expect(res).toEqual(expect.objectContaining({ success: true }));
  });
});
