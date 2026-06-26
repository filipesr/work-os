import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {},
}));

vi.mock("@/lib/permissions", () => ({
  requireMemberOrHigher: vi.fn(),
}));

import { isValidStageAssignee, parseStageAssignments } from "@/lib/stage-assignment-helpers";

const stageWithTeam = {
  id: "s1",
  defaultTeamId: "t1",
  defaultTeam: { members: [{ id: "u1" }, { id: "u2" }] },
};

describe("isValidStageAssignee", () => {
  it("aceita um membro da equipe da etapa", () => {
    expect(isValidStageAssignee(stageWithTeam, "u1")).toBe(true);
  });
  it("rejeita quem não é membro", () => {
    expect(isValidStageAssignee(stageWithTeam, "u9")).toBe(false);
  });
  it("rejeita atribuição quando a etapa não tem equipe", () => {
    expect(isValidStageAssignee({ id: "s2", defaultTeamId: null, defaultTeam: null }, "u1")).toBe(
      false
    );
  });
});

describe("parseStageAssignments", () => {
  it("extrai pares stageId->assigneeId das chaves assignee:", () => {
    const fd = new FormData();
    fd.set("title", "x");
    fd.set("assignee:s1", "u1");
    fd.set("assignee:s2", ""); // vazio = sem atribuição, ignorar
    fd.set("assignee:s3", "u3");
    expect(parseStageAssignments(fd)).toEqual({ s1: "u1", s3: "u3" });
  });
  it("retorna objeto vazio quando não há chaves assignee:", () => {
    const fd = new FormData();
    fd.set("title", "x");
    expect(parseStageAssignments(fd)).toEqual({});
  });
});
