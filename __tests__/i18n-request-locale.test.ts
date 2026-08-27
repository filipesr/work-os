import { describe, it, expect, vi } from "vitest";

// No ambiente de teste o `next-intl` resolve para o build de CLIENTE, onde `getRequestConfig` lança
// ("not supported in Client Components"). O mock espelha o que a função de verdade faz — devolver o
// próprio callback (é o que o tipo dela declara) — para podermos chamá-lo direto.
vi.mock("next-intl/server", () => ({ getRequestConfig: (fn: unknown) => fn }));

import getRequestConfigured from "@/i18n";

/**
 * Este teste existe por causa de um bug que ficou meses invisível.
 *
 * O `i18n.ts` usava a assinatura da v3 (`{ locale }`) com o next-intl na v4, onde o parâmetro é
 * `{ requestLocale }`. O argumento chegava `undefined`, a validação reprovava e TODO Server
 * Component renderizava em pt-BR — em qualquer URL. Passava despercebido porque os Client
 * Components continuavam certos (o layout alimenta o provider a partir de `params.locale`): metade
 * do app traduzia, metade não.
 *
 * O teste de paridade de locales não pegava e nunca pegaria: ele garante que a chave EXISTE nos dois
 * idiomas, não que a certa foi escolhida. São perguntas diferentes, e esta faltava.
 */

type RequestConfigFn = (params: { requestLocale: Promise<string | undefined> }) => Promise<{
  locale: string;
  messages: Record<string, unknown>;
}>;

const config = getRequestConfigured as unknown as RequestConfigFn;

const resolve = (requestLocale: string | undefined) =>
  config({ requestLocale: Promise.resolve(requestLocale) });

describe("resolução de locale do request (Server Components)", () => {
  it("respeita o idioma pedido pela URL", async () => {
    const { locale } = await resolve("es-ES");
    expect(locale).toBe("es-ES");
  });

  it("mantém o padrão quando o pedido já é o padrão", async () => {
    expect((await resolve("pt-BR")).locale).toBe("pt-BR");
  });

  it("carrega as mensagens DO idioma resolvido, não as do padrão", async () => {
    // O sintoma real do bug: locale certo no papel, dicionário errado na tela.
    const { messages } = await resolve("es-ES");
    const auth = messages.auth as { errors: Record<string, { title: string }> };
    expect(auth.errors.notInvited.title).toBe("Este correo no tiene acceso a Work OS");
  });

  it("cai no padrão fora do segmento [locale] (requestLocale undefined)", async () => {
    expect((await resolve(undefined)).locale).toBe("pt-BR");
  });

  it("cai no padrão para valor inválido — o segmento age como catch-all", async () => {
    // `/unknown.txt` chega aqui como se fosse um idioma.
    expect((await resolve("unknown.txt")).locale).toBe("pt-BR");
    expect((await resolve("fr-FR")).locale).toBe("pt-BR");
  });
});
