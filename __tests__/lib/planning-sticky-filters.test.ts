import { beforeEach, describe, expect, it } from "vitest";
import { readSticky, storageKey, writeSticky } from "@/lib/planning/sticky-filters";

const CHAVES = ["team", "user", "showCompleted"];

beforeEach(() => {
  window.localStorage.clear();
});

describe("storageKey", () => {
  it("é por tela — a mesa do gestor não herda o filtro do calendário", () => {
    expect(storageKey("week")).not.toBe(storageKey("calendar-week"));
  });

  it("tem prefixo do app — não colide com outra coisa no mesmo domínio", () => {
    expect(storageKey("week")).toMatch(/^workos:/);
  });
});

describe("writeSticky / readSticky", () => {
  it("o que foi salvo volta", () => {
    writeSticky("week", { team: "t1,t2", user: "u9" });
    expect(readSticky("week", CHAVES)).toEqual({ team: "t1,t2", user: "u9" });
  });

  it("sem nada salvo, devolve vazio — não null, não erro", () => {
    expect(readSticky("week", CHAVES)).toEqual({});
  });

  it("salvar de novo SUBSTITUI: o filtro removido não ressuscita no próximo carregamento", () => {
    writeSticky("week", { team: "t1", user: "u9" });
    writeSticky("week", { team: "t1" });
    expect(readSticky("week", CHAVES)).toEqual({ team: "t1" });
  });

  it("só devolve as chaves que a tela conhece", () => {
    // Uma tela que perdeu um filtro (ou um link de outra versão) não pode reinjetar um parâmetro
    // que ninguém mais lê: ele ficaria na URL sem controle que o desmarque.
    writeSticky("week", { team: "t1", fantasma: "x" });
    expect(readSticky("week", CHAVES)).toEqual({ team: "t1" });
  });

  it("valor não-texto no armazenamento é ignorado, não derruba a tela", () => {
    window.localStorage.setItem(
      storageKey("week"),
      JSON.stringify({ team: { oi: 1 }, user: "u9" })
    );
    expect(readSticky("week", CHAVES)).toEqual({ user: "u9" });
  });

  it("conteúdo corrompido não derruba a tela — abre sem filtro", () => {
    window.localStorage.setItem(storageKey("week"), "{isso não é json");
    expect(readSticky("week", CHAVES)).toEqual({});
  });

  it("salvar vazio LIMPA o registro em vez de guardar um objeto vazio", () => {
    writeSticky("week", { team: "t1" });
    writeSticky("week", {});
    expect(window.localStorage.getItem(storageKey("week"))).toBeNull();
  });
});
