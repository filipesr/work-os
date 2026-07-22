import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/permissions", () => ({ requireMemberOrHigher: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { taskActiveStage: { count: vi.fn() } }, prisma: {} }));
import prisma from "@/lib/prisma";
import { getAssigneeTypeExperience, EXPERIENCE_THRESHOLD } from "@/lib/actions/assignee-experience";
const db = prisma as unknown as { taskActiveStage: { count: ReturnType<typeof vi.fn> } };

describe("getAssigneeTypeExperience", () => {
  beforeEach(() => vi.clearAllMocks());
  it("experienced quando concluídas >= limiar", async () => {
    db.taskActiveStage.count.mockResolvedValue(EXPERIENCE_THRESHOLD);
    const r = await getAssigneeTypeExperience("u1", "tpl");
    expect(r).toEqual({ completed: EXPERIENCE_THRESHOLD, experienced: true });
    const where = db.taskActiveStage.count.mock.calls[0][0].where;
    expect(where).toEqual({ assigneeId: "u1", status: "COMPLETED", stage: { templateId: "tpl" } });
  });
  it("não experienced abaixo do limiar", async () => {
    db.taskActiveStage.count.mockResolvedValue(EXPERIENCE_THRESHOLD - 1);
    expect((await getAssigneeTypeExperience("u1", "tpl")).experienced).toBe(false);
  });
  it("userId/templateId vazio → false sem tocar o banco", async () => {
    expect(await getAssigneeTypeExperience("", "tpl")).toEqual({
      completed: 0,
      experienced: false,
    });
    expect(db.taskActiveStage.count).not.toHaveBeenCalled();
  });
});
