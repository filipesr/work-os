import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { applyIfRequested, parseArgs, type Args } from "@/scripts/import-trello/run";
import type { ImportPlan } from "@/lib/trello/plan";
import type { ImportReport } from "@/lib/trello/writer";

// Plano e prisma mínimos — este teste NÃO exercita `buildImportPlan` nem `applyImportPlan` de
// verdade (já testados nas Tasks 8/9). Ele prova só a fiação: que o valor de `--commit` é a única
// coisa que decide se `applyImportPlan` é chamado, e com que `commit`.
const PLAN: ImportPlan = { projects: [], tasks: [], skipped: [], unmatchedPeople: [] };
const FAKE_PRISMA = {} as PrismaClient;
const FAKE_REPORT: ImportReport = {
  commit: true,
  projectsCreated: 0,
  projectsReused: 0,
  tasksCreated: 0,
  skippedAlreadyImported: 0,
  artifactsCreated: 0,
  reworkEventsCreated: 0,
  failedMonths: [],
};

function argsWith(overrides: Partial<Args>): Args {
  return { file: "f.json", clientId: "c1", commit: false, ...overrides };
}

describe("applyIfRequested — a fiação do --commit", () => {
  it("sem --commit, nunca chama applyImportPlan e devolve null", async () => {
    const applyFn = vi.fn().mockResolvedValue(FAKE_REPORT);
    const result = await applyIfRequested(argsWith({ commit: false }), PLAN, FAKE_PRISMA, applyFn);

    expect(applyFn).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("com --commit, chama applyImportPlan com commit: true e o importedById passado", async () => {
    const applyFn = vi.fn().mockResolvedValue(FAKE_REPORT);
    const args = argsWith({ commit: true, importedById: "u1" });
    const result = await applyIfRequested(args, PLAN, FAKE_PRISMA, applyFn);

    expect(applyFn).toHaveBeenCalledTimes(1);
    expect(applyFn).toHaveBeenCalledWith(FAKE_PRISMA, PLAN, { commit: true, importedById: "u1" });
    expect(result).toBe(FAKE_REPORT);
  });
});

describe("parseArgs", () => {
  it("exige --file", () => {
    expect(() => parseArgs(["--client", "c1"])).toThrow(/--file/);
  });

  it("exige --client", () => {
    expect(() => parseArgs(["--file", "f.json"])).toThrow(/--client/);
  });

  it("exige --imported-by junto com --commit", () => {
    expect(() => parseArgs(["--file", "f.json", "--client", "c1", "--commit"])).toThrow(
      /--imported-by/
    );
  });

  it("aceita ensaio sem --imported-by", () => {
    const args = parseArgs(["--file", "f.json", "--client", "c1"]);
    expect(args).toEqual({
      file: "f.json",
      clientId: "c1",
      commit: false,
      importedById: undefined,
    });
  });
});
