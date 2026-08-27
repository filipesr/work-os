import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";
import { getMessages } from "./lib/i18n";

// Can be imported from a shared config
export const locales = ["pt-BR", "es-ES"] as const;
export type Locale = (typeof locales)[number];

/**
 * ⚠️ A assinatura importa: no next-intl **v4** o parâmetro é `requestLocale` (uma Promise), e não
 * mais o `locale` da v3.
 *
 * Com a assinatura antiga o argumento chegava `undefined`, a validação abaixo reprovava e TODO
 * Server Component caía no fallback `pt-BR` — qualquer que fosse a URL. O bug passava despercebido
 * porque os Client Components continuavam certos: o layout do `[locale]` alimenta o
 * `NextIntlClientProvider` a partir de `params.locale`. Metade do app traduzia, metade não, e o
 * teste de paridade não pegava — ele garante que a chave EXISTE nos dois idiomas, não que a certa
 * foi escolhida.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  // `requestLocale` é `undefined` fora do segmento `[locale]`, e pode trazer lixo — o segmento age
  // como catch-all de rotas desconhecidas. Nos dois casos, cai no idioma padrão.
  const validLocale = locales.includes(requested as Locale) ? (requested as Locale) : "pt-BR";

  const messages = await getMessages(validLocale);

  return {
    locale: validLocale,
    messages,
  };
});
