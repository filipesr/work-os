"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireMemberOrHigher } from "@/lib/permissions";

/** Times com seus membros, para rotear uma etapa CORINGA (template sem time
 *  padrão) na criação da demanda. Aberto a member-or-higher porque é a mesma
 *  permissão de criar tarefa — exigir admin aqui travaria o próprio formulário. */
export async function getTeamsWithMembers(): Promise<
  {
    id: string;
    name: string;
    members: { id: string; name: string | null; email: string | null }[];
  }[]
> {
  await requireMemberOrHigher();
  return prisma.team.findMany({
    select: {
      id: true,
      name: true,
      members: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" } },
    },
    orderBy: { name: "asc" },
  });
}

// ========== Team detail page actions (movidas de admin/teams/[teamId]/page) ==========

export async function updateTeam(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  if (!id || !name) return;

  await prisma.team.update({
    where: { id },
    data: { name },
  });

  revalidatePath(`/admin/teams/${id}`);
  revalidatePath("/admin/teams");
}

export async function deleteTeam(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  await prisma.team.delete({
    where: { id },
  });

  revalidatePath("/admin/teams");
}

export async function setTeamMembers(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  const userIds = formData.getAll("userIds").map(String);

  await prisma.team.update({
    where: { id },
    data: { members: { set: userIds.map((userId) => ({ id: userId })) } },
  });

  revalidatePath(`/admin/teams/${id}`);
  revalidatePath("/admin/teams");
  revalidatePath("/dashboard");
}
