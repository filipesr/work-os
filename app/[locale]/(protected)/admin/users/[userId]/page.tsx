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

// §3.1/§10: a analítica da pessoa (throughput, utilização, qualidade, etapas
// ativas, horas) NÃO mora no CRUD — vive em /reports/user/[id], guardada por
// P1/P2. Aqui ficam só identidade, edição e o link. As contagens abaixo são
// contexto de UMA linha para quem vai mexer em papel/times/capacidade ("essa
// pessoa tem trabalho em curso?"), não uma segunda cópia dos dados.
async function getUser(userId: string) {
  await requireAdmin();
  const [user, hours] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        teams: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        _count: {
          select: {
            activeStages: { where: { status: "ACTIVE" } },
            assignedTasks: true,
          },
        },
      },
    }),
    // Total real de horas. Antes era a soma dos 10 registros mais recentes que a
    // tabela carregava — um "total" que parava no décimo lançamento.
    prisma.timeLog.aggregate({ where: { userId }, _sum: { hoursSpent: true } }),
  ]);

  return user ? { ...user, totalHours: hours._sum.hoursSpent ?? 0 } : null;
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
        <StatCard label={t("activeStages")} value={user._count.activeStages} />
        <StatCard label={t("assignedTasks")} value={user._count.assignedTasks} />
        <StatCard label={t("hoursLogged")} value={user.totalHours.toFixed(1)} />
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
    </div>
  );
}
