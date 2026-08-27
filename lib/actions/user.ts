"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { requireAdmin, getSessionUser } from "@/lib/permissions";

export async function updateUserRoleAndTeams(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  const role = formData.get("role") as UserRole;
  const teamIds = formData.getAll("teamIds").map(String);
  const birthdayRaw = formData.get("birthday") as string | null;
  const admissionRaw = formData.get("admissionDate") as string | null;
  const capacityRaw = formData.get("weeklyCapacityHours") as string | null;
  const weeklyCapacityHours = capacityRaw && capacityRaw.trim() !== "" ? Number(capacityRaw) : null;
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
      weeklyCapacityHours:
        weeklyCapacityHours != null &&
        Number.isFinite(weeklyCapacityHours) &&
        weeklyCapacityHours > 0
          ? Math.round(weeklyCapacityHours)
          : null,
    },
  });

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  revalidatePath("/dashboard"); // ✅ Revalidate dashboard
}

// ========== Ciclo de vida do acesso ==========
//
// Estas três ações existem porque o login passou a ser POR CONVITE (ver o callback `signIn` em
// auth.config.ts). Enquanto qualquer conta Google entrava sozinha, nada disto fazia falta — e
// desativar alguém seria inócuo, porque bastaria entrar de novo.

/** Cadastra alguém que ainda não entrou. Sem senha e sem `Account`: o vínculo com o Google nasce
 *  no primeiro login, por e-mail verificado. É o que destranca a porta depois que o acesso virou
 *  por convite — sem isto, ninguém novo jamais entraria. */
export async function inviteUser(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = (formData.get("role") as UserRole) || UserRole.MEMBER;
  const teamIds = formData.getAll("teamIds").map(String).filter(Boolean);

  if (!email || !email.includes("@")) return { error: "Informe um e-mail válido." };
  if (!Object.values(UserRole).includes(role)) return { error: "Papel inválido." };

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { error: "Já existe um usuário com este e-mail." };

  const user = await prisma.user.create({
    data: {
      email,
      name: name || null,
      role,
      ...(teamIds.length > 0 ? { teams: { connect: teamIds.map((id) => ({ id })) } } : {}),
    },
    select: { id: true },
  });

  revalidatePath("/admin/users");
  return { success: true as const, userId: user.id };
}

/** Liga/desliga o acesso. Desativar TAMBÉM derruba as sessões abertas: sem isso a pessoa seguiria
 *  navegando com o cookie que já tinha até ele expirar, e "desativado" não significaria nada hoje —
 *  só amanhã. As sessões são de banco, então apagar a linha corta na hora. */
export async function setUserDisabled(userId: string, disabled: boolean) {
  await requireAdmin();
  const me = await getSessionUser();

  // Um admin que se desativa perde o acesso à tela que reverteria isso. Como o acesso agora é por
  // convite, não há caminho de volta a não ser mexer no banco.
  if (disabled && me?.id === userId) {
    return { error: "Você não pode desativar a si mesmo." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { disabledAt: disabled ? new Date() : null },
    });
    if (disabled) await tx.session.deleteMany({ where: { userId } });
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { success: true as const };
}

/** "Renovar": desfaz o vínculo com o Google para que o próximo login o refaça do zero.
 *
 *  Serve para o vínculo ERRADO ou obsoleto — conta Google trocada, resquício de um projeto OAuth
 *  antigo. Não é o remédio para "perdemos o banco": ali não há vínculo nenhum, e o próprio login
 *  reconstrói (`allowDangerousEmailAccountLinking`).
 *
 *  Só remove `Account`. O User continua com papel, times, comentários e horas — o que se perde é a
 *  credencial, não a pessoa. Derruba as sessões junto, senão a pessoa seguiria autenticada por uma
 *  credencial que acabou de deixar de existir. */
export async function renewGoogleLink(userId: string) {
  await requireAdmin();

  const removed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.account.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    return count;
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { success: true as const, removed };
}
