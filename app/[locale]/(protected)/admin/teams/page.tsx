import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { Users } from "lucide-react";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";
import { SimpleEntityCrudList, type CrudItem } from "@/components/admin/SimpleEntityCrudList";
import { DeleteTeamButton } from "./delete-team-button";

export const metadata: Metadata = {
  title: "Equipes",
};

async function getTeams() {
  await requireAdmin();
  return await prisma.team.findMany({
    include: {
      _count: {
        select: { members: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

async function createTeam(formData: FormData) {
  "use server";
  await requireAdmin();
  const name = formData.get("name") as string;
  if (!name) return;

  await prisma.team.create({
    data: { name },
  });

  revalidatePath("/admin/teams");
}

async function deleteTeam(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  await prisma.team.delete({
    where: { id },
  });

  revalidatePath("/admin/teams");
}

export default async function TeamsPage() {
  const teams = await getTeams();
  const t = await getTranslations("admin.teams");

  const items: CrudItem[] = teams.map((team) => ({
    id: team.id,
    href: `/admin/teams/${team.id}`,
    title: team.name,
    meta: t("membersCount", { count: team._count.members }),
    actions: <DeleteTeamButton teamId={team.id} deleteAction={deleteTeam} />,
  }));

  return (
    <SimpleEntityCrudList
      kicker={t("kicker")}
      title={t("title")}
      subtitle={t("subtitle")}
      createTitle={t("createTitle")}
      createAction={createTeam}
      createFields={[{ name: "name", placeholder: t("namePlaceholder"), required: true }]}
      createButtonLabel={t("createButton")}
      items={items}
      emptyLabel={t("noTeams")}
      emptyIcon={Users}
    />
  );
}
