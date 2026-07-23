import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import { BackLink } from "@/components/ui/BackLink";
import { StatCard } from "@/components/admin/StatCard";
import { updateTeam, deleteTeam, setTeamMembers } from "@/lib/actions/team";
import { EditTeamHeader } from "./edit-team-header";
import ManageTeamMembers from "./manage-members-button";

async function getAllUsers() {
  await requireAdmin();
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

async function getTeam(teamId: string) {
  await requireAdmin();
  return await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        select: { id: true, name: true, email: true, image: true, role: true },
        orderBy: { name: "asc" },
      },
      defaultStages: {
        include: { template: { select: { id: true, name: true } } },
        orderBy: { order: "asc" },
      },
    },
  });
}

export default async function TeamDetailPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const [team, allUsers, t, tRoles] = await Promise.all([
    getTeam(teamId),
    getAllUsers(),
    getTranslations("admin.teams.detail"),
    getTranslations("admin.users.roles"),
  ]);

  if (!team) {
    notFound();
  }

  return (
    <div className="container mx-auto p-8">
      <BackLink href="/admin/teams" label={t("backToTeams")} className="mb-6" />

      {/* Header Card */}
      <EditTeamHeader
        team={{ id: team.id, name: team.name }}
        updateTeam={updateTeam}
        deleteTeam={deleteTeam}
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <StatCard label={t("totalMembers")} value={team.members.length} />
        <StatCard label={t("defaultStages")} value={team.defaultStages.length} />
      </div>

      {/* Members Table */}
      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground">{t("membersTable")}</h2>
          <ManageTeamMembers
            teamId={team.id}
            teamName={team.name}
            users={allUsers}
            currentMemberIds={team.members.map((member) => member.id)}
            setMembers={setTeamMembers}
          />
        </div>
        <div className="bg-card shadow-lg rounded-xl border border-border overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("memberName")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("memberEmail")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("memberRole")}
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {team.members.map((member) => (
                <tr key={member.id} className="hover:bg-accent transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {member.image && (
                        <img
                          className="h-8 w-8 rounded-full mr-3 border border-border"
                          src={getProxiedImageUrl(member.image) || undefined}
                          alt=""
                        />
                      )}
                      <Link
                        href={`/admin/users/${member.id}`}
                        className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                      >
                        {member.name || member.email}
                      </Link>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-muted-foreground">{member.email}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-3 py-1 inline-flex text-xs font-bold rounded-full bg-primary/10 text-primary border border-primary/20">
                      {tRoles(member.role.toLowerCase())}
                    </span>
                  </td>
                </tr>
              ))}
              {team.members.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {t("noMembers")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Default Stages Section */}
      <div className="mt-6">
        <h2 className="text-xl font-bold text-foreground mb-4">{t("stagesTable")}</h2>
        <div className="bg-card shadow-lg rounded-xl border border-border overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("stageName")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("stageTemplate")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("stageOrder")}
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {team.defaultStages.map((stage) => (
                <tr key={stage.id} className="hover:bg-accent transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-semibold text-foreground">{stage.name}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/admin/templates/${stage.template.id}`}
                      className="text-sm text-primary hover:text-primary/80 font-semibold transition-colors"
                    >
                      {stage.template.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-muted-foreground">{stage.order}</span>
                  </td>
                </tr>
              ))}
              {team.defaultStages.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {t("noStages")}
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
