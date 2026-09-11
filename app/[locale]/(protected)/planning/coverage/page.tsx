import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Users } from "lucide-react";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getWeeklyCoverage } from "@/lib/actions/weekly-coverage";
import { getProjectsForSelect, getTemplatesForSelect } from "@/lib/actions/task";
import { sumStageHours } from "../calendar/shared";
import { getClients } from "@/lib/actions/client";
import { PlanningFilters } from "@/components/planning/PlanningFilters";
import { parseMultiParam } from "@/lib/planning/multi-param";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { todayInSaoPaulo, formatISODate, mondayOfWeek } from "@/lib/dates";
import { parseWeekWindow } from "@/lib/calendar/weekly-window";
import { WeekBlock } from "./WeekBlock";
import { WeekWindowToggle } from "./WeekWindowToggle";

export const metadata: Metadata = { title: "Cobertura Semanal" };

/**
 * Cobertura semanal: quem tem agenda em cada semana e quem está parado.
 *
 * Separada de `/planning/dates` porque as duas têm dinâmicas opostas — esta
 * é leitura recorrente de planejamento (abre-se toda semana para agir), aquela é
 * cadastro esporádico de calendário (mexe-se poucas vezes por ano).
 */
export default async function CoveragePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const sp = await searchParams;
  const weeks = parseWeekWindow(sp.weeks);
  const clienteBruto = Array.isArray(sp.client) ? sp.client.join(",") : sp.client;
  const today = todayInSaoPaulo();
  const currentMonday = formatISODate(mondayOfWeek(today));

  // A lista de clientes vem ANTES, e não em paralelo com a cobertura: é ela que valida o recorte
  // da URL. Um link com cliente apagado precisa cair em "todos" — abrir a tela vazia com um filtro
  // que não dá para desmarcar, porque a opção sumiu do seletor, é o pior dos dois mundos.
  const clients = await getClients();
  const clientIds = parseMultiParam(
    clienteBruto,
    clients.map((c) => c.id)
  );

  const [t, locale, coverage, rawProjects, rawTemplates] = await Promise.all([
    getTranslations("planning.coverage"),
    getLocale(),
    getWeeklyCoverage(weeks, { clientIds }),
    getProjectsForSelect(),
    getTemplatesForSelect(),
  ]);

  const isEs = locale.startsWith("es");
  const projects = rawProjects.map((p) => ({
    id: p.id,
    name: p.name,
    clientId: p.clientId,
    clientName: p.client.name,
  }));
  const templates = rawTemplates.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    totalDurationHours: sumStageHours(tpl.stages),
  }));

  const total = coverage.activeClients.length;

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <PlanningFilters
              scope="coverage"
              fields={[
                {
                  kind: "multi",
                  param: "client",
                  label: t("clientsLabel"),
                  options: clients.map((c) => ({ id: c.id, name: c.name })),
                  selected: clientIds,
                },
              ]}
              labels={{
                title: t("filtersTitle"),
                subtitle: t("filtersSubtitle"),
                clearAll: t("clearAll"),
                clearOne: (filter) => t("clearOne", { filter }),
                count: (label, count) => t("clientsCount", { label, count }),
              }}
            />
            <WeekWindowToggle current={weeks} />
          </>
        }
      />

      <div className="space-y-6">
        {/* Ociosidade sustentada: sem NADA na janela inteira. Problema diferente
            de ter uma semana vazia, por isso vem separado e antes. */}
        {coverage.idleAllWindow.length > 0 && (
          <SectionCard title={t("idleAll.title")} subtitle={t("idleAll.subtitle", { weeks })}>
            <div className="flex flex-wrap gap-1.5">
              {coverage.idleAllWindow.map((c) => (
                <StatusBadge key={c.id} tone="warning" label={c.name} />
              ))}
            </div>
          </SectionCard>
        )}

        {total === 0 ? (
          <SectionCard>
            <EmptyState icon={Users} title={t("noClients")} description={t("noClientsHint")} />
          </SectionCard>
        ) : (
          <div>
            <h2 className="mb-1 text-base font-semibold text-foreground">{t("weekly.title")}</h2>
            <p className="mb-4 text-sm text-muted-foreground">{t("weekly.subtitle")}</p>
            {/* Duas colunas: com 8–12 semanas, uma coluna só obrigava a rolar
                muito para comparar semanas próximas. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {coverage.weeks.map((w) => (
                <WeekBlock
                  key={w.key}
                  week={w}
                  totalClients={total}
                  isCurrent={w.key === currentMonday}
                  isEs={isEs}
                  clients={clients}
                  projects={projects}
                  templates={templates}
                  locale={locale}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
