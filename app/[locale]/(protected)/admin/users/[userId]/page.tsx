import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import { BarChart3, ChevronRight } from "lucide-react";
import EditUserButton from "../edit-user-button";
import { updateUserRoleAndTeams } from "@/lib/actions/user";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";

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
  const [user, teams, t, tRoles] = await Promise.all([
    getUser(userId),
    getTeams(),
    getTranslations("admin.users.detail"),
    getTranslations("admin.users.roles"),
  ]);

  if (!user) {
    notFound();
  }

  const totalHours = user.timeLogs.reduce((sum, log) => sum + Number(log.hoursSpent), 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={tRoles(user.role.toLowerCase())}
        title={user.name || user.email || ""}
        subtitle={user.email ?? undefined}
        backHref="/admin/users"
        backLabel={t("backToUsers")}
        actions={
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
        }
      />

      {/* Identity card */}
      <SectionCard>
        <div className="flex flex-wrap items-center gap-4">
          {user.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="h-16 w-16 rounded-full border border-border"
              src={getProxiedImageUrl(user.image) || undefined}
              alt=""
            />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone="info" label={tRoles(user.role.toLowerCase())} />
              {user.teams.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {user.teams.map((tm) => tm.name).join(", ")}
                </span>
              )}
            </div>
            {user.lastSeenAt && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("lastSeen")}: {new Date(user.lastSeenAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Info Cards */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard label={t("activeStages")} value={user.activeStages.length} />
        <StatCard label={t("assignedTasks")} value={user.assignedTasks.length} />
        <StatCard label={t("hoursLogged")} value={totalHours.toFixed(1)} />
      </div>

      {/* §3.1: as análises de pessoa (throughput/utilização/qualidade/retrabalho)
          NÃO moram no CRUD. A visão canônica é o relatório da pessoa, guardado
          por P1/P2 (não vira ranking). O CRUD apenas linka para lá. */}
      <Link
        href={`/reports/user/${user.id}`}
        className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-6 shadow-sm transition-colors hover:bg-accent"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-base font-semibold text-foreground">{t("reportLink.title")}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("reportLink.subtitle")}</p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>

      {/* Active Stages Table */}
      <SectionCard title={t("activeStagesTable")} className="mt-6" bodyClassName="p-0">
        {user.activeStages.length === 0 ? (
          <div className="p-6">
            <p className="text-sm text-muted-foreground">{t("noActiveStages")}</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-foreground">
                  {t("task")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-foreground">
                  {t("stage")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-foreground">
                  {t("template")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-foreground">
                  {t("activatedAt")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {user.activeStages.map((activeStage) => (
                <tr key={activeStage.id} className="transition-colors hover:bg-accent">
                  <td className="whitespace-nowrap px-6 py-4">
                    <Link
                      href={`/admin/tasks/${activeStage.task.id}`}
                      className="text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                    >
                      {activeStage.task.title}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="text-sm text-foreground">{activeStage.stage.name}</span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="text-sm text-muted-foreground">
                      {activeStage.stage.template.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="text-sm text-muted-foreground">
                      {activeStage.activatedAt
                        ? new Date(activeStage.activatedAt).toLocaleDateString()
                        : "-"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Recent Time Logs */}
      <SectionCard title={t("recentTimeLogs")} className="mt-6" bodyClassName="p-0">
        {user.timeLogs.length === 0 ? (
          <div className="p-6">
            <p className="text-sm text-muted-foreground">{t("noTimeLogs")}</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-foreground">
                  {t("date")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-foreground">
                  {t("hours")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-foreground">
                  {t("description")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {user.timeLogs.map((log) => (
                <tr key={log.id} className="transition-colors hover:bg-accent">
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="text-sm text-foreground">
                      {new Date(log.logDate).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
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
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
