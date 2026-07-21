import { es, ptBR } from "date-fns/locale";
import type { Locale } from "date-fns";

/**
 * Mapeia o locale ativo do app (next-intl: "pt-BR" | "es-ES") para o locale
 * do date-fns correspondente. Use em `format`/`formatDistanceToNow` para que
 * tempos relativos e nomes localizados saiam no idioma do usuário.
 *
 * Client Components: `const locale = useLocale(); ... dateFnsLocale(locale)`.
 * Server Components: `const locale = await getLocale(); ...`.
 */
export function dateFnsLocale(locale: string): Locale {
  return locale.startsWith("es") ? es : ptBR;
}

/**
 * Conector localizado para strings "data <em> hora" (ex.: "21/07/2026 às 14:30").
 * pt-BR → "às", es-ES → "a las". O formato numérico dd/MM/aaaa é o mesmo nos
 * dois locales, então só o conector precisa mudar.
 */
export function atConnector(locale: string): string {
  return locale.startsWith("es") ? "a las" : "às";
}
