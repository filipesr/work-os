import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { requireAdmin } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import EditUserButton from "../edit-user-button";

async function getUser(userId: string) {
  await requireAdmin();
  return await prisma.user.findUnique({
    where: { id: userId },
    include: {
      team: true,
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

async function updateUser(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = formData.get("id") as string;
  const role = formData.get("role") as UserRole;
  const newTeamId = formData.get("teamId") as string | null;
  if (!id || !role) return;

  const activeStages = await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: id,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (activeStages.length > 0) {
    await prisma.taskActiveStage.updateMany({
      where: {
        assigneeId: id,
        status: "ACTIVE",
      },
      data: { assigneeId: null },
    });

    const affectedTasks = await prisma.taskActiveStage.findMany({
      where: {
        assigneeId: null,
        status: "ACTIVE",
      },
      select: { taskId: true },
      distinct: ["taskId"],
    });

    for (const stage of affectedTasks) {
      const remainingAssigned = await prisma.taskActiveStage.count({
        where: {
          taskId: stage.taskId,
          assigneeId: { not: null },
          status: "ACTIVE",
        },
      });

      if (remainingAssigned === 0) {
        await prisma.task.update({
          where: { id: stage.taskId },
          data: { status: "BACKLOG" },
        });
      }
    }
  }

  await prisma.user.update({
    where: { id },
    data: {
      role,
      teamId: newTeamId || null,
    },
  });

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
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
    <div className="container mx-auto p-8">
      <Link
        href="/admin/users"
        className="inline-flex items-center text-primary hover:text-primary/80 mb-6 font-semibold transition-colors"
      >
        <svg
          className="w-5 h-5 mr-2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path d="M15 19l-7-7 7-7" />
        </svg>
        {t("backToUsers")}
      </Link>

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
                {user.team && (
                  <span className="text-sm text-muted-foreground">{user.team.name}</span>
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
                teamId: user.teamId,
              }}
              teams={teams}
              updateUser={updateUser}
            />
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
          <p className="text-sm text-muted-foreground">{t("activeStages")}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{user.activeStages.length}</p>
        </div>
        <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
          <p className="text-sm text-muted-foreground">{t("assignedTasks")}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{user.assignedTasks.length}</p>
        </div>
        <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
          <p className="text-sm text-muted-foreground">{t("hoursLogged")}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{totalHours.toFixed(1)}</p>
        </div>
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
