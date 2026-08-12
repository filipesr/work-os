import { describe, it, expect } from "vitest";
import { verifyWallboardToken, WALLBOARD_COOKIE } from "@/lib/tv-wallboard";

const TOKEN = "a".repeat(64);

describe("verifyWallboardToken", () => {
  it("aceita o token exato", () => {
    expect(verifyWallboardToken(TOKEN, TOKEN)).toBe(true);
  });

  it("rejeita token diferente do mesmo tamanho", () => {
    expect(verifyWallboardToken("b".repeat(64), TOKEN)).toBe(false);
  });

  it("rejeita prefixo correto (não sai no primeiro byte igual)", () => {
    expect(verifyWallboardToken("a".repeat(63) + "b", TOKEN)).toBe(false);
    expect(verifyWallboardToken("a".repeat(63), TOKEN)).toBe(false);
  });

  it("é FAIL-CLOSED quando o token não está configurado", () => {
    // O caso que importa: uma instalação sem TV_WALLBOARD_TOKEN não pode virar
    // um wallboard aberto. Sem essa guarda, "" === "" liberaria a TV para
    // qualquer requisição sem cookie nenhum.
    expect(verifyWallboardToken("qualquer-coisa", undefined)).toBe(false);
    expect(verifyWallboardToken("qualquer-coisa", "")).toBe(false);
    expect(verifyWallboardToken("qualquer-coisa", null)).toBe(false);
  });

  it("rejeita credencial ausente mesmo com token configurado", () => {
    expect(verifyWallboardToken(undefined, TOKEN)).toBe(false);
    expect(verifyWallboardToken("", TOKEN)).toBe(false);
    expect(verifyWallboardToken(null, TOKEN)).toBe(false);
  });

  it("vazio contra vazio NÃO autentica", () => {
    // Cookie ausente + env ausente é o estado mais comum em dev; se isso
    // passasse, o wallboard estaria aberto em toda instalação não configurada.
    expect(verifyWallboardToken("", "")).toBe(false);
    expect(verifyWallboardToken(undefined, undefined)).toBe(false);
  });

  it("o nome do cookie é específico do app (não colide na mesma origem)", () => {
    expect(WALLBOARD_COOKIE).toBe("workos.tv-wallboard");
  });
});
