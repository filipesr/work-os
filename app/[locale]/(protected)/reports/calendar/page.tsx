import { permanentRedirect } from "next/navigation";

/**
 * O calendário deixou de morar em "Relatórios": é ferramenta OPERACIONAL
 * (reagenda, cria demanda), não leitura retrospectiva. Mudou para
 * /planejamento/calendario.
 *
 * Este stub existe para não quebrar links salvos, favoritos e o histórico do
 * navegador. `permanentRedirect` (308) preserva a query string, então
 * ?view=month&week=...&team=... continua funcionando exatamente igual.
 */
export default async function LegacyCalendarRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
  }
  const query = qs.toString();
  permanentRedirect(`/planejamento/calendario${query ? `?${query}` : ""}`);
}
