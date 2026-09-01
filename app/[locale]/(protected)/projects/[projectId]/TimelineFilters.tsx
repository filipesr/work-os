"use client";

import { useTranslations } from "next-intl";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";

/** Os mesmos quatro filtros do kanban que saiu — tirar capacidade em silêncio é pior que a tela
 *  antiga. A diferença é que "minhas" e "por responsável" agora olham o responsável da ETAPA, que
 *  é o que eles sempre quiseram dizer. */
export function TimelineFilters({
  mine,
  assigneeId,
  teamId,
  priority,
  people,
  teams,
}: {
  mine: boolean;
  assigneeId?: string;
  teamId?: string;
  priority?: string;
  people: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}) {
  const t = useTranslations("projects.timeline");
  const tPriority = useTranslations("tasks.priority");
  const { setParam } = useUrlFilters({ replace: true });

  const campo = "h-9 rounded-lg border border-input-border bg-input px-2 text-sm text-foreground";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm text-foreground">
        <input
          type="checkbox"
          checked={mine}
          onChange={(e) => setParam("mine", e.target.checked ? "1" : null)}
          className="h-4 w-4 rounded border-input-border text-primary"
        />
        {t("filters.mine")}
      </label>

      <select
        value={assigneeId ?? ""}
        onChange={(e) => setParam("assignee", e.target.value || null)}
        aria-label={t("filters.allAssignees")}
        className={campo}
      >
        <option value="">{t("filters.allAssignees")}</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        value={teamId ?? ""}
        onChange={(e) => setParam("team", e.target.value || null)}
        aria-label={t("filters.allTeams")}
        className={campo}
      >
        <option value="">{t("filters.allTeams")}</option>
        {teams.map((tm) => (
          <option key={tm.id} value={tm.id}>
            {tm.name}
          </option>
        ))}
      </select>

      <select
        value={priority ?? ""}
        onChange={(e) => setParam("priority", e.target.value || null)}
        aria-label={t("filters.allPriorities")}
        className={campo}
      >
        <option value="">{t("filters.allPriorities")}</option>
        {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
          <option key={p} value={p}>
            {tPriority(p.toLowerCase())}
          </option>
        ))}
      </select>
    </div>
  );
}
