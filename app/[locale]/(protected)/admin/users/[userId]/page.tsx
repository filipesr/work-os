import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import EditUserButton from "../edit-user-button";
import { updateUserRoleAndTeams } from "@/lib/actions/user";
import { BackLink } from "@/components/ui/BackLink";
import { StatCard } from "@/components/admin/StatCard";
import {
  getPersonThroughputSeries,
  getPersonWorkload,
  getPersonUtilization,
  getPersonQuality,
  getPersonReworkEvents,
} from "@/lib/actions/person-metrics";
import { ThroughputLine } from "@/components/reports/FlowCharts";
import { monthRangeSaoPaulo, currentMonthSaoPaulo } from "@/lib/dates";
import ReworkClassifyToggle from "@/components/people/ReworkClassifyToggle";

async function getUser(userId: string) {
  await requireAdmin();
  return await prisma.user.findUnique({
    where: { id: userId },
    include: {
      teams: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      activeStages: {
        where: { status: "ACTIVE" },
        include: {
          task: { select: { id: true, title: true } },
          stage: { include: { template: { select: { name: true } } } },
        },
        orderBy: { activatedAt: "desc" },
      },
      assignedTasks: {
        select: { id: true, title: true, status: true, priority: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      },
      timeLogs: {
        select: { id: true, hoursSpent: true, logDate: true, description: true },
        orderBy: { logDate: "desc" },
        take: 10,
      },
    },
  });
}

async function getTeams() {
  await requireAdmin();
  return await prisma.team.findMany({
    orderBy: { name: "asc" },
  });
}

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [user, teams, t, tRoles, tQuality] = await Promise.all([
    getUser(userId),
    getTeams(),
    getTranslations("admin.users.detail"),
    getTranslations("admin.users.roles"),
    getTranslations("admin.users.quality"),
  ]);

  if (!user) {
    notFound();
  }

  const { start: monthStart, end: monthEnd } = monthRangeSaoPaulo(currentMonthSaoPaulo());
  const [throughput, workload, util, quality, reworkItems] = await Promise.all([
    getPersonThroughputSeries(userId, 8),
    getPersonWorkload(userId),
    getPersonUtilization(userId, { from: monthStart, to: monthEnd }),
    getPersonQuality(userId, { from: monthStart, to: monthEnd }),
    getPersonReworkEvents(userId, 20),
  ]);

  const totalHours = user.timeLogs.reduce((sum, log) => sum + Number(log.hoursSpent), 0);

  return (
    <div className="container mx-auto p-8">
      <BackLink href="/admin/users" label={t("backToUsers")} className="mb-6" />

      {/* Header Card */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {user.image && (
              <img
                className="h-16 w-16 rounded-full border-2 border-border"
                src={getProxiedImageUrl(user.image) || undefined}
                alt=""
              />
            )}
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-1">{user.name || user.email}</h1>
              <p className="text-sm text-muted-foreground mb-2">{user.email}</p>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 inline-flex text-xs font-bold rounded-full bg-primary/10 text-primary border border-primary/20">
                  {tRoles(user.role.toLowerCase())}
                </span>
                {user.teams.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {user.teams.map((tm) => tm.name).join(", ")}
                  </span>
                )}
              </div>
              {user.lastSeenAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t("lastSeen")}: {new Date(user.lastSeenAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <div className="ml-4">
            <EditUserButton
              user={{
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                teams: user.teams,
                birthday: user.birthday ? user.birthday.toISOString().slice(0, 10) : null,
                admissionDate: user.admissionDate
                  ? user.admissionDate.toISOString().slice(0, 10)
                  : null,
                weeklyCapacityHours: user.weeklyCapacityHours,
              }}
              teams={teams}
              updateUser={updateUserRoleAndTeams}
            />
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <StatCard label={t("activeStages")} value={user.activeStages.length} />
        <StatCard label={t("assignedTasks")} value={user.assignedTasks.length} />
        <StatCard label={t("hoursLogged")} value={totalHours.toFixed(1)} />
      </div>

      {/* Throughput + Utilização (auto-referenciado) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
          <h2 className="text-lg font-bold text-foreground mb-1">{t("throughputTitle")}</h2>
          <p className="text-xs text-muted-foreground mb-3">{t("selfReferencedNote")}</p>
          {throughput.some((p) => p.count > 0) ? (
            <ThroughputLine points={throughput} label={t("throughputTitle")} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("throughputEmpty")}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {t("agingNote", { aging: workload.aging, wip: workload.wip })}
          </p>
        </div>
        <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
          <h2 className="text-lg font-bold text-foreground mb-1">{t("utilizationTitle")}</h2>
          {util.weeklyCapacityHours == null ? (
            <p className="text-sm text-muted-foreground">{t("utilizationNoTarget")}</p>
          ) : (
            (() => {
              const pct = Math.round((util.utilization ?? 0) * 100);
              const tone =
                pct > 90
                  ? "text-rose-600 dark:text-rose-400"
                  : pct >= 60
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400";
              return (
                <>
                  <p className={`text-3xl font-bold ${tone}`}>{pct}%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("utilizationDetail", {
                      hours: util.hours.toFixed(1),
                      capacity: util.weeklyCapacityHours,
                    })}
                  </p>
                </>
              );
            })()
          )}
        </div>
      </div>

      {/* Qualidade (defeito-only, 3b.T3/T4) */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mt-6">
        <h2 className="text-lg font-bold text-foreground mb-1">{tQuality("qualityTitle")}</h2>
        <p className="text-xs text-muted-foreground mb-4">{tQuality("qualityConfoundNote")}</p>
        <div className="flex flex-wrap gap-6 mb-4">
          <div>
            <div className="text-xs text-muted-foreground">{tQuality("ftrLabel")}</div>
            <div className="text-2xl font-bold">
              {quality.firstTimeRight == null
                ? "—"
                : `${Math.round(quality.firstTimeRight * 100)}%`}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{tQuality("defectsLabel")}</div>
            <div className="text-sm">
              {tQuality("defectsSplit", { internal: quality.internal, client: quality.client })}
            </div>
          </div>
        </div>
        {reworkItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tQuality("noReturns")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {reworkItems.map((r) => (
              <li key={r.id} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.taskTitle}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.sourceStageName} ·{" "}
                    {tQuality(r.kind === "INTERNAL" ? "kindInternal" : "kindClient")}
                  </div>
                  {r.reason && (
                    <div className="text-xs italic text-muted-foreground">“{r.reason}”</div>
                  )}
                </div>
                <ReworkClassifyToggle reworkEventId={r.id} current={r.reworkClass} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Active Stages Table */}
      <div className="mt-6">
        <h2 className="text-xl font-bold text-foreground mb-4">{t("activeStagesTable")}</h2>
        <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("task")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("stage")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("template")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("activatedAt")}
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {user.activeStages.map((activeStage) => (
                <tr key={activeStage.id} className="hover:bg-accent transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/admin/tasks/${activeStage.task.id}`}
                      className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      {activeStage.task.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-foreground">{activeStage.stage.name}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-muted-foreground">
                      {activeStage.stage.template.name}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-muted-foreground">
                      {activeStage.activatedAt
                        ? new Date(activeStage.activatedAt).toLocaleDateString()
                        : "-"}
                    </span>
                  </td>
                </tr>
              ))}
              {user.activeStages.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {t("noActiveStages")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Time Logs */}
      <div className="mt-6">
        <h2 className="text-xl font-bold text-foreground mb-4">{t("recentTimeLogs")}</h2>
        <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("date")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("hours")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("description")}
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {user.timeLogs.map((log) => (
                <tr key={log.id} className="hover:bg-accent transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-foreground">
                      {new Date(log.logDate).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-foreground">
                      {Number(log.hoursSpent).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-muted-foreground">
                      {log.description || t("noDescription")}
                    </span>
                  </td>
                </tr>
              ))}
              {user.timeLogs.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {t("noTimeLogs")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
