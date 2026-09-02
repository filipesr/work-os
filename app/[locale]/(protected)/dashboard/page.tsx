import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { availableStageWhere } from "@/lib/task-availability";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Activity, Hourglass, AlertTriangle, CheckCircle2, Clock, Info, Zap } from "lucide-react";
import { PersonalKPIs, type KpiItem } from "@/components/shared/PersonalKPIs";
import { StageList, type StageRow } from "@/components/shared/StageList";
import { ClaimActiveStageButton } from "@/components/tasks/ClaimActiveStageButton";
import { getDueState } from "@/lib/dates";
import { stageAgingRatio } from "@/lib/team-health-format";
import { DEFAULT_SLA_HOURS } from "@/lib/actions/team-health";
import { getTeamBacklog } from "@/lib/actions/task";
import type { Tone } from "@/lib/status-tone";
import { stagePath } from "@/lib/navigation";

export const metadata: Metadata = { title: "Dashboard" };

// Aviso informacional (P1/P7) quando o WIP pessoal passa do ideal — lembrete, não bloqueio.
const SOFT_WIP = 4;

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/** Rótulo de vencimento relativo ("Vence hoje", "Em 3 dias", "Atrasada 1d"). */
function dueInfo(
  dueDate: Date | null,
  nowMs: number,
  tFlow: Translator
): { label: string; overdue: boolean } {
  if (!dueDate) return { label: tFlow("noDue"), overdue: false };
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date(dueDate)) - startOfDay(new Date(nowMs))) / 8.64e7);
  if (diff === 0) return { label: tFlow("dueToday"), overdue: false };
  if (diff === 1) return { label: tFlow("dueTomorrow"), overdue: false };
  if (diff > 1) return { label: tFlow("dueInDays", { days: diff }), overdue: false };
  return { label: tFlow("overdueByDays", { days: Math.abs(diff) }), overdue: true };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return notFound();
  const userId = session.user.id as string;

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { teams: { select: { id: true } } },
  });
  const teamIds = currentUser?.teams.map((team) => team.id) ?? [];

  if (teamIds.length === 0) {
    const tNoTeam = await getTranslations("dashboard.noTeam");
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-foreground">
          {tNoTeam("title", { userName: session.user.name?.split(" ")[0] || "Usuário" })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{tNoTeam("message")}</p>
        <div className="mt-6 rounded-lg border-l-4 border-warning bg-warning-subtle p-4 text-sm text-warning">
          <strong>{tNoTeam("warningTitle")}</strong> {tNoTeam("warningMessage")}
        </div>
      </div>
    );
  }

  const t = await getTranslations("dashboard");
  const tFlow = await getTranslations("common.flow");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 8.64e7);

  const [myStages, completedThisWeek, hoursAgg, backlog] = await Promise.all([
    prisma.taskActiveStage.findMany({
      // Só o que já entrou na janela de execução (ver lib/task-availability).
      where: {
        assigneeId: userId,
        status: { in: ["ACTIVE", "BLOCKED"] },
        ...availableStageWhere(),
      },
      include: { task: { include: { project: { include: { client: true } } } }, stage: true },
      orderBy: { task: { dueDate: "asc" } },
    }),
    prisma.taskActiveStage.count({
      where: { assigneeId: userId, status: "COMPLETED", completedAt: { gte: weekAgo } },
    }),
    prisma.timeLog.aggregate({
      where: { userId, logDate: { gte: startOfToday } },
      _sum: { hoursSpent: true },
    }),
    getTeamBacklog(teamIds),
  ]);

  // KPIs derivados da MESMA lista (§3: nunca divergir do que está na tabela).
  const nowMs = Date.now();
  let aging = 0;
  let atRisk = 0;
  for (const s of myStages) {
    const blocked = s.status === "BLOCKED";
    const overdue = getDueState(s.task.dueDate) === "overdue";
    const ratio = stageAgingRatio(
      s.activatedAt,
      s.stage.expectedDurationHours ?? DEFAULT_SLA_HOURS,
      nowMs
    );
    if (blocked || overdue) atRisk++;
    else if (ratio >= 0.75) aging++;
  }
  const active = myStages.length;
  const hoursToday = hoursAgg._sum.hoursSpent ?? 0;

  const kpis: KpiItem[] = [
    {
      key: "active",
      label: t("stats.activeTasks"),
      value: String(active),
      hint: t("stats.activeTasksHint"),
      tone: "neutral",
      icon: Activity,
    },
    {
      key: "aging",
      label: t("stats.aging"),
      value: String(aging),
      hint: t("stats.agingHint"),
      tone: aging > 0 ? "warning" : "neutral",
      icon: Hourglass,
    },
    {
      key: "atRisk",
      label: t("stats.atRisk"),
      value: String(atRisk),
      hint: t("stats.atRiskHint"),
      tone: atRisk > 0 ? "danger" : "neutral",
      icon: AlertTriangle,
    },
    {
      key: "done",
      label: t("stats.completedWeek"),
      value: String(completedThisWeek),
      hint: t("stats.completedWeekHint"),
      tone: "success",
      icon: CheckCircle2,
    },
    {
      key: "hours",
      label: t("stats.hoursToday"),
      value: `${hoursToday.toFixed(1)}h`,
      hint: t("stats.hoursTodayHint"),
      tone: "info",
      icon: Clock,
    },
  ];

  const rows: StageRow[] = myStages.map((s) => {
    const blocked = s.status === "BLOCKED";
    const due = dueInfo(s.task.dueDate, nowMs, tFlow);
    let tone: Tone;
    let label: string;
    if (blocked) {
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
      // Vem de "meu foco" (etapas ativas do usuário): leva para a tela de trabalho da etapa.
      href: stagePath(s.task.id, s.id),
      taskTitle: s.task.title,
      clientProject: `${s.task.project.client.name} · ${s.task.project.name}`,
      stageName: s.stage.name,
      statusTone: tone,
      statusLabel: label,
      blocked,
      ageHours: (nowMs - new Date(s.activatedAt).getTime()) / 3.6e6,
      slaHours: s.stage.expectedDurationHours ?? DEFAULT_SLA_HOURS,
      dueLabel: due.label,
      dueOverdue: due.overdue,
    };
  });

  const firstName = session.user.name?.split(" ")[0] || "Usuário";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">
          {t("greeting", { userName: firstName })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {/* O registro rápido só cumpre o objetivo se estiver a um toque de distância: a feature
          existe para vencer atrito, e escondê-la num menu recriaria o atrito. */}
      <Link
        href="/tasks/quick"
        className="mb-6 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
      >
        <Zap className="h-4 w-4 text-primary" />
        {t("quickTaskCta")}
      </Link>

      <PersonalKPIs items={kpis} />

      {/* Meu foco */}
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-foreground">{t("myFocus.title")}</h2>
          <span className="text-sm text-muted-foreground">{active}</span>
        </div>
        {active > SOFT_WIP && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2.5 text-sm text-warning">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("myFocus.nudge", { count: active })}</span>
          </div>
        )}
        <StageList rows={rows} emptyLabel={t("myFocus.empty")} />
      </section>

      {/* Backlog do time */}
      <section className="mt-8">
        <div className="mb-3">
          <h2 className="text-lg font-bold text-foreground">{t("teamBacklog.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("teamBacklog.subtitle")}</p>
        </div>
        {backlog.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            {t("emptyStates.teamBacklogClean")}
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {backlog.map((b) => (
              <li key={b.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{b.task.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {b.task.project.client.name} · {b.task.project.name} · {b.stage.name}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {dueInfo(b.task.dueDate, nowMs, tFlow).label}
                  </div>
                  {/* Etapa coringa: o nome não diz o que fazer. Sem a instrução
                      aqui, a pessoa só descobriria depois de pegar. */}
                  {b.instructions && (
                    <p className="mt-1 line-clamp-2 rounded border border-warning/30 bg-warning-subtle px-2 py-1 text-xs text-warning">
                      {b.instructions}
                    </p>
                  )}
                </div>
                <ClaimActiveStageButton taskId={b.task.id} stageId={b.stage.id} isBlocked={false} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
