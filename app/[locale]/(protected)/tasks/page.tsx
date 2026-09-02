import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyAllStages } from "@/lib/actions/task";
import { DEFAULT_SLA_HOURS } from "@/lib/actions/team-health";
import { PersonalKPIs, type KpiItem } from "@/components/shared/PersonalKPIs";
import { StageList, type StageRow } from "@/components/shared/StageList";
import { WorkFilters, type WorkScope, type WorkStatus } from "@/components/shared/WorkFilters";
import type { ActiveStageWithDetails } from "@/types/task";
import type { Tone } from "@/lib/status-tone";
import { stagePath } from "@/lib/navigation";

export const metadata: Metadata = { title: "Meu Trabalho" };

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function dueInfo(dueDate: Date | null, nowMs: number, tFlow: Translator) {
  if (!dueDate) return { label: tFlow("noDue"), overdue: false };
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date(dueDate)) - startOfDay(new Date(nowMs))) / 8.64e7);
  if (diff === 0) return { label: tFlow("dueToday"), overdue: false };
  if (diff === 1) return { label: tFlow("dueTomorrow"), overdue: false };
  if (diff > 1) return { label: tFlow("dueInDays", { days: diff }), overdue: false };
  return { label: tFlow("overdueByDays", { days: Math.abs(diff) }), overdue: true };
}

function isOverdue(s: ActiveStageWithDetails, nowMs: number): boolean {
  return !!s.task.dueDate && new Date(s.task.dueDate).getTime() < nowMs && s.status !== "COMPLETED";
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const scope: WorkScope = sp.scope === "team" ? "team" : "mine";
  const status = (
    ["active", "blocked", "completed", "overdue"].includes(sp.status ?? "") ? sp.status : null
  ) as WorkStatus | null;
  const from = sp.from ?? "";
  const to = sp.to ?? "";

  const t = await getTranslations("tasks.myWork");
  const tFlow = await getTranslations("common.flow");

  // Uma fetch (escopo + intervalo, todos os status). KPIs vêm do stats completo;
  // a LISTA é filtrada pela pílula de status (§3: KPIs = visão geral, pílula = drill).
  const { stages, stats } = await getMyAllStages({
    onlyMine: scope === "mine",
    startDate: from || null,
    endDate: to || null,
  });

  const nowMs = Date.now();

  const kpis: KpiItem[] = [
    { key: "total", label: t("kpiTotal"), value: String(stats.total), tone: "neutral" },
    { key: "active", label: t("kpiActive"), value: String(stats.byStatus.ACTIVE), tone: "info" },
    {
      key: "blocked",
      label: t("kpiBlocked"),
      value: String(stats.byStatus.BLOCKED),
      tone: stats.byStatus.BLOCKED > 0 ? "warning" : "neutral",
    },
    {
      key: "completed",
      label: t("kpiCompleted"),
      value: String(stats.byStatus.COMPLETED),
      tone: "success",
    },
    {
      key: "overdue",
      label: t("kpiOverdue"),
      value: String(stats.overdue),
      tone: stats.overdue > 0 ? "danger" : "neutral",
    },
    {
      key: "hours",
      label: t("kpiHours"),
      value: `${stats.totalHoursLogged.toFixed(1)}h`,
      tone: "info",
    },
  ];

  // Filtra a lista pela pílula.
  const filtered = stages.filter((s) => {
    if (!status) return true;
    if (status === "active") return s.status === "ACTIVE";
    if (status === "blocked") return s.status === "BLOCKED";
    if (status === "completed") return s.status === "COMPLETED";
    return isOverdue(s, nowMs); // overdue
  });

  const rows: StageRow[] = filtered.map((s) => {
    const blocked = s.status === "BLOCKED";
    const completed = s.status === "COMPLETED";
    const due = dueInfo(s.task.dueDate, nowMs, tFlow);
    let tone: Tone;
    let label: string;
    if (completed) {
      tone = "success";
      label = tFlow("statusCompleted");
    } else if (blocked) {
      tone = "warning";
      label = tFlow("statusBlocked");
    } else if (due.overdue) {
      tone = "danger";
      label = tFlow("statusOverdue");
    } else {
      tone = "info";
      label = tFlow("statusActive");
    }
    return {
      id: s.id,
      // Vem de "minhas etapas": leva para a tela de trabalho da etapa, não para a demanda.
      href: stagePath(s.task.id, s.id),
      taskTitle: s.task.title,
      clientProject: `${s.task.project.client.name} · ${s.task.project.name}`,
      stageName: s.stage.name,
      statusTone: tone,
      statusLabel: label,
      blocked,
      ageHours: completed ? null : (nowMs - new Date(s.activatedAt).getTime()) / 3.6e6,
      slaHours: completed ? null : (s.stage.expectedDurationHours ?? DEFAULT_SLA_HOURS),
      dueLabel: completed ? tFlow("statusCompleted") : due.label,
      dueOverdue: due.overdue && !completed,
    };
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="space-y-6">
        <WorkFilters scope={scope} status={status} from={from} to={to} />
        <PersonalKPIs items={kpis} columns={6} />
        <section>
          <div className="mb-3">
            <h2 className="text-lg font-bold text-foreground">{t("listTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("listSubtitle")}</p>
          </div>
          <StageList rows={rows} emptyLabel={t("empty")} />
        </section>
      </div>
    </div>
  );
}
