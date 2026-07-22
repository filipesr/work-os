import Link from "next/link";
import { getTeamsForFilter, getProjectsForSelect, getTemplatesForSelect } from "@/lib/actions/task";
import { getClients } from "@/lib/actions/client";
import { formatMonthLabel } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations, getLocale } from "next-intl/server";

const SELECT_CLASS =
  "w-full h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200";

interface ReportFilterBarProps {
  basePath: string;
  /** Translation namespace holding the shared `filters.*` keys. */
  namespace: string;
  /** Available months for the month select (source differs per report). */
  months: string[];
  month: string;
  teamId?: string;
  clientId?: string;
  projectId?: string;
  templateId?: string;
  /** Opt-in: only reports that filter by work type render the type selector. */
  includeTemplate?: boolean;
  hasFilters: boolean;
}

export async function ReportFilterBar({
  basePath,
  namespace,
  months,
  month,
  teamId,
  clientId,
  projectId,
  templateId,
  includeTemplate,
  hasFilters,
}: ReportFilterBarProps) {
  const [t, locale, teams, clients, projects, templates] = await Promise.all([
    getTranslations(namespace),
    getLocale(),
    getTeamsForFilter(),
    getClients(),
    getProjectsForSelect(),
    includeTemplate ? getTemplatesForSelect() : Promise.resolve([]),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("filters.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* key remounts the uncontrolled selects when the active filters change
            (incl. "Limpar"), so their displayed values reset to the new defaults. */}
        <form
          method="GET"
          key={`${month}|${teamId ?? ""}|${clientId ?? ""}|${projectId ?? ""}|${templateId ?? ""}`}
          className="flex flex-wrap gap-4 items-end"
        >
          <div className="min-w-[160px]">
            <label htmlFor="month" className="block text-sm font-semibold text-foreground mb-2">
              {t("filters.month")}
            </label>
            <select id="month" name="month" defaultValue={month} className={SELECT_CLASS}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonthLabel(m, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px] flex-1">
            <label htmlFor="teamId" className="block text-sm font-semibold text-foreground mb-2">
              {t("filters.team")}
            </label>
            <select id="teamId" name="teamId" defaultValue={teamId ?? ""} className={SELECT_CLASS}>
              <option value="">{t("filters.allTeams")}</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px] flex-1">
            <label htmlFor="clientId" className="block text-sm font-semibold text-foreground mb-2">
              {t("filters.client")}
            </label>
            <select
              id="clientId"
              name="clientId"
              defaultValue={clientId ?? ""}
              className={SELECT_CLASS}
            >
              <option value="">{t("filters.allClients")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px] flex-1">
            <label htmlFor="projectId" className="block text-sm font-semibold text-foreground mb-2">
              {t("filters.project")}
            </label>
            <select
              id="projectId"
              name="projectId"
              defaultValue={projectId ?? ""}
              className={SELECT_CLASS}
            >
              <option value="">{t("filters.allProjects")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.client.name} - {p.name}
                </option>
              ))}
            </select>
          </div>
          {includeTemplate && (
            <div className="min-w-[160px] flex-1">
              <label
                htmlFor="templateId"
                className="block text-sm font-semibold text-foreground mb-2"
              >
                {t("filters.type")}
              </label>
              <select
                id="templateId"
                name="templateId"
                defaultValue={templateId ?? ""}
                className={SELECT_CLASS}
              >
                <option value="">{t("filters.allTypes")}</option>
                {templates.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="submit"
            className="h-11 px-6 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md"
          >
            {t("filters.filter")}
          </button>
          {hasFilters && (
            <Link
              href={basePath}
              className="h-11 inline-flex items-center px-6 border-2 border-input-border rounded-lg hover:bg-muted transition-all duration-200"
            >
              {t("filters.clear")}
            </Link>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
