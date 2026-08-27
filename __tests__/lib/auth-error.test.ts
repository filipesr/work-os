import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUTH_ERROR_KEYS, authErrorKey, isRetryableAuthError } from "@/lib/auth-error";

// A tela de login ignorava `?error=` por completo: a pessoa via
// `?error=OAuthAccountNotLinked` na barra de endereços e uma tela idêntica à normal. Estes testes
// travam o mapeamento e — o mais importante — que todo código mapeado tenha texto NOS DOIS idiomas.
// Uma chave faltando não quebra build nem teste de tipo: vira "MISSING_MESSAGE" na cara do usuário,
// que é a versão nova do mesmo problema.

describe("authErrorKey", () => {
  it("traduz o código do Auth.js na chave de mensagem", () => {
    expect(authErrorKey("OAuthAccountNotLinked")).toBe("oauthAccountNotLinked");
    expect(authErrorKey("AccessDenied")).toBe("accessDenied");
  });

  it("traduz os códigos nossos, do callback signIn", () => {
    expect(authErrorKey("NotInvited")).toBe("notInvited");
    expect(authErrorKey("AccountDisabled")).toBe("accountDisabled");
    expect(authErrorKey("NoEmail")).toBe("noEmail");
  });

  it("agrupa as falhas transitórias do provedor sob uma mensagem só", () => {
    for (const code of ["OAuthSignin", "OAuthCallback", "OAuthCreateAccount", "Callback"]) {
      expect(authErrorKey(code)).toBe("providerError");
    }
  });

  it("sem erro na URL → nada a exibir", () => {
    expect(authErrorKey(undefined)).toBeNull();
    expect(authErrorKey("")).toBeNull();
  });

  it("código desconhecido vira mensagem genérica, nunca silêncio", () => {
    // Silenciar é justamente o defeito que este trabalho conserta.
    expect(authErrorKey("CodigoQueAindaNaoExiste")).toBe("unknown");
  });

  it("aceita o parâmetro repetido na URL usando o primeiro", () => {
    expect(authErrorKey(["AccessDenied", "NotInvited"])).toBe("accessDenied");
  });
});

describe("isRetryableAuthError", () => {
  it('só oferece "tentar de novo" onde insistir pode resolver', () => {
    expect(isRetryableAuthError("providerError")).toBe(true);
    expect(isRetryableAuthError("unknown")).toBe(true);
  });

  it("recusa por cadastro ou desativação não melhora com insistência", () => {
    for (const key of ["notInvited", "accountDisabled", "oauthAccountNotLinked"]) {
      expect(isRetryableAuthError(key)).toBe(false);
    }
  });
});

describe("cobertura de i18n", () => {
  const locales = ["pt-BR", "es-ES"] as const;

  it.each(locales)("%s tem título e corpo para todo código mapeado", (locale) => {
    const auth = JSON.parse(
      readFileSync(join(process.cwd(), "locales", locale, "auth.json"), "utf8")
    ) as { errors: Record<string, { title?: string; body?: string }> };

    const chaves = new Set([...Object.values(AUTH_ERROR_KEYS), "unknown"]);
    for (const chave of chaves) {
      expect(auth.errors[chave]?.title, `${locale} › ${chave}.title`).toBeTruthy();
      expect(auth.errors[chave]?.body, `${locale} › ${chave}.body`).toBeTruthy();
    }
  });

  it("a mensagem de vínculo ausente aponta para a ação do admin, não para o vazio", () => {
    // Quem lê precisa sair sabendo o que pedir. "Renovar" é o nome do botão em /admin/users.
    const pt = JSON.parse(
      readFileSync(join(process.cwd(), "locales", "pt-BR", "auth.json"), "utf8")
    ) as { errors: Record<string, { body: string }> };
    expect(pt.errors.oauthAccountNotLinked.body.toLowerCase()).toContain("renovar");
  });
});
