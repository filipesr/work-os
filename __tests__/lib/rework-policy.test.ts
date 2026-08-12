import { describe, it, expect } from "vitest";
import { canReclassifyRework } from "@/lib/rework-policy";

const gestor = { viewerId: "manager-1", subjectId: "member-1", role: "MANAGER" as const };

describe("canReclassifyRework — salvaguarda 4 da exceção 3b", () => {
  it("gestor e admin reclassificam o retorno de outra pessoa", () => {
    expect(canReclassifyRework(gestor)).toBe(true);
    expect(canReclassifyRework({ ...gestor, role: "ADMIN" })).toBe(true);
  });

  it("a própria pessoa NUNCA reclassifica o próprio retorno", () => {
    // Salvaguarda (4): a pessoa vê a classificação, não a edita — senão o FTR
    // vira um número autoeditável e para de informar qualquer coisa.
    expect(canReclassifyRework({ viewerId: "m1", subjectId: "m1", role: "MEMBER" })).toBe(false);
  });

  it("gestor tampouco reclassifica os PRÓPRIOS retornos", () => {
    // O buraco não óbvio: o papel sozinho autorizaria. Um gestor corrigindo a
    // própria nota é o mesmo gaming pela porta dos fundos.
    expect(canReclassifyRework({ viewerId: "m1", subjectId: "m1", role: "MANAGER" })).toBe(false);
    expect(canReclassifyRework({ viewerId: "a1", subjectId: "a1", role: "ADMIN" })).toBe(false);
  });

  it("supervisor não reclassifica — a exceção 3b nomeia gestor/admin", () => {
    expect(canReclassifyRework({ ...gestor, role: "SUPERVISOR" })).toBe(false);
  });

  it("member, cliente e sessão sem papel não reclassificam ninguém", () => {
    // Default-deny: só ADMIN/MANAGER passam. Um papel novo no enum cai aqui.
    for (const role of ["MEMBER", "CLIENT", null] as const) {
      expect(canReclassifyRework({ ...gestor, role })).toBe(false);
    }
  });
});
