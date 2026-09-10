import { describe, expect, it } from "vitest";
import { matchMembers, type TrelloMember, type WorkOSUser } from "@/lib/trello/map-people";

/** Helper: cria um membro do Trello com valores padrão. */
function m(overrides: Partial<TrelloMember> = {}): TrelloMember {
  return {
    id: "",
    username: "",
    fullName: "",
    ...overrides,
  };
}

describe("matchMembers", () => {
  const users: WorkOSUser[] = [
    { id: "u1", name: "Adonias Henrique Dias Nery", email: "henriquegoonmkt@gmail.com" },
    { id: "u2", name: "Benicio Mathias Gonzalez Delgado", email: "mathiasgoonmk@gmail.com" },
    { id: "u3", name: "Alessandra Francielli Marques", email: "leligoonmkt@gmail.com" },
  ];

  it("casa pelo prefixo do e-mail — o padrão <apelido>goonmkt@", () => {
    const r = matchMembers([m({ id: "t1", username: "leligoon", fullName: "Lèli Goon" })], users);
    expect(r.byTrelloId.get("t1")).toBe("u3");
  });

  it("casa pelo nome completo idêntico", () => {
    const r = matchMembers([m({ id: "t2", fullName: "Adonias Henrique Dias Nery" })], users);
    expect(r.byTrelloId.get("t2")).toBe("u1");
  });

  it("casa por nome e sobrenome contidos no nome completo", () => {
    const r = matchMembers([m({ id: "t3", fullName: "Mathias Gonzalez" })], users);
    expect(r.byTrelloId.get("t3")).toBe("u2");
  });

  it("quem não casa vai para repescagem — NUNCA para o mais parecido", () => {
    const r = matchMembers([m({ id: "t9", fullName: "Fulano Que Saiu", username: "xyz" })], users);
    expect(r.byTrelloId.has("t9")).toBe(false);
    expect(r.unmatched.map((x) => x.id)).toEqual(["t9"]);
  });

  it("um usuário do WorkOS não é atribuído a dois membros do Trello", () => {
    // Dois membros que ambos casam com o mesmo usuário
    const r = matchMembers(
      [
        m({ id: "t10", fullName: "Adonias Henrique Dias Nery" }), // Casa exatamente com u1
        m({ id: "t11", username: "henrique", fullName: "Henrique da Silva" }), // Também tenta u1 (prefixo)
      ],
      users
    );
    // Ambos devem estar em unmatched
    expect(r.byTrelloId.has("t10")).toBe(false);
    expect(r.byTrelloId.has("t11")).toBe(false);
    expect(r.unmatched.map((x) => x.id).sort()).toEqual(["t10", "t11"]);
  });

  it("múltiplos casamentos ambíguos — todos vão para repescagem", () => {
    const r = matchMembers(
      [
        m({ id: "t1", fullName: "Adonias Henrique Dias Nery" }),
        m({ id: "t2", username: "henrique" }),
      ],
      users
    );
    expect(r.unmatched.length).toBe(2);
    expect(r.unmatched.map((x) => x.id).sort()).toEqual(["t1", "t2"]);
  });

  it("retorna mapa vazio e lista vazia quando não há membros", () => {
    const r = matchMembers([], users);
    expect(r.byTrelloId.size).toBe(0);
    expect(r.unmatched.length).toBe(0);
  });

  it("casamentos únicos e corretos convivem", () => {
    const r = matchMembers(
      [
        m({ id: "t1", username: "leligoon" }), // Casa com u3
        m({ id: "t2", fullName: "Adonias Henrique Dias Nery" }), // Casa com u1
      ],
      users
    );
    expect(r.byTrelloId.get("t1")).toBe("u3");
    expect(r.byTrelloId.get("t2")).toBe("u1");
    expect(r.unmatched.length).toBe(0);
  });

  it("prefixo de e-mail é insensível a maiúsculas e acentos", () => {
    // "leligoon" deve casar com "leligoonmkt@" independente de maiúsculas
    const r = matchMembers([m({ id: "t1", username: "LeliGoon", fullName: "Test" })], users);
    expect(r.byTrelloId.get("t1")).toBe("u3");
  });
});
