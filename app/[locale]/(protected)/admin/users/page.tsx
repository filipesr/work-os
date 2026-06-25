import { revalidatePath } from "next/cache";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import EditUserButton from "./edit-user-button";
import { requireAdmin } from "@/lib/permissions";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/ui/pagination";
import { DEFAULT_PAGE_SIZE, paginate, parsePage, type PageParams } from "@/lib/pagination";

async function getUsers(page: number, pageSize: number) {
  await requireAdmin();
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      include: { teams: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
      orderBy: { email: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count(),
  ]);
  return paginate(items, total, page, pageSize);
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
  const teamIds = formData.getAll("teamIds").map(String);
  const birthdayRaw = formData.get("birthday") as string | null;
  const admissionRaw = formData.get("admissionDate") as string | null;
  if (!id || !role) return;

  // Detect whether the team set actually changed (to avoid unassigning stages
  // when only role/dates are edited).
  const current = await prisma.user.findUnique({
    where: { id },
    select: { teams: { select: { id: true } } },
  });
  const currentIds = new Set(current?.teams.map((tm) => tm.id) ?? []);
  const teamsChanged =
    currentIds.size !== teamIds.length || teamIds.some((tid) => !currentIds.has(tid));

  // ✅ VALIDATION: Check if user has active stages when changing teams
  const activeStages = await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: id,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  // If changing team and has active stages, automatically unassign them
  if (teamsChanged && activeStages.length > 0) {
    await prisma.taskActiveStage.updateMany({
      where: {
        assigneeId: id,
        status: "ACTIVE",
      },
      data: { assigneeId: null }, // ✅ Desatribui etapas ativas automaticamente
    });

    // Also update task status if needed
    const affectedTasks = await prisma.taskActiveStage.findMany({
      where: {
        assigneeId: null,
        status: "ACTIVE",
      },
      select: { taskId: true },
      distinct: ["taskId"],
    });

    // Set tasks back to BACKLOG if they have no more assigned stages
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
      teams: { set: teamIds.map((tid) => ({ id: tid })) },
      birthday: birthdayRaw ? new Date(birthdayRaw) : null,
      admissionDate: admissionRaw ? new Date(admissionRaw) : null,
    },
  });

  revalidatePath("/admin/users");
  revalidatePath("/dashboard"); // ✅ Revalidate dashboard
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const [paginatedUsers, teams] = await Promise.all([
    getUsers(page, DEFAULT_PAGE_SIZE),
    getTeams(),
  ]);
  const { items: users, total, totalPages, pageSize } = paginatedUsers;
  const t = await getTranslations("admin.users");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Users List */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.user")}
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.email")}
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.role")}
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.team")}
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-accent transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {user.image && (
                      <img
                        className="h-10 w-10 rounded-full mr-3 border-2 border-border"
                        src={getProxiedImageUrl(user.image) || undefined}
                        alt=""
                      />
                    )}
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      {user.name || t("noName")}
                    </Link>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-muted-foreground">{user.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-3 py-1 inline-flex text-xs font-bold rounded-full bg-primary/10 text-primary border border-primary/20">
                    {t(`roles.${user.role.toLowerCase()}`)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-muted-foreground">
                    {user.teams.length > 0
                      ? user.teams.map((tm) => tm.name).join(", ")
                      : t("noTeam")}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
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
                    }}
                    teams={teams}
                    updateUser={updateUser}
                  />
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  {t("noUsers")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          basePath="/admin/users"
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
        />
      </div>
    </div>
  );
}
