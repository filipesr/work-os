"use client";

import { useTranslations } from "next-intl";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";

/**
 * Filtro por cliente da lista de projetos. Vive na URL (`?client=`) junto com a
 * busca, então os dois compõem e o resultado é compartilhável.
 */
export function ProjectClientFilter({
  clients,
  selected,
}: {
  clients: { id: string; name: string }[];
  selected?: string;
}) {
  const t = useTranslations("common.projectsList");
  const { setParam } = useUrlFilters({ replace: true });

  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="font-medium text-muted-foreground">{t("clientLabel")}:</span>
      <select
        value={selected ?? ""}
        onChange={(e) => setParam("client", e.target.value || null)}
        aria-label={t("clientLabel")}
        className="h-10 rounded-lg border-2 border-input-border bg-input px-3 text-sm font-medium text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
      >
        <option value="">{t("allClients")}</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
