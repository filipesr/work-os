import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";
import { getMessages } from "./lib/i18n";

// Can be imported from a shared config
export const locales = ["pt-BR", "es-ES"] as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async ({ locale }) => {
  // Ensure locale is valid, fallback to pt-BR if not
  const validLocale = locales.includes(locale as Locale)
    ? (locale as Locale)
    : "pt-BR";

  // Load all translation messages
  const messages = await getMessages(validLocale);

  return {
    locale: validLocale,
    messages,
  };
});
