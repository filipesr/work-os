"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { requireAdmin } from "@/lib/permissions";

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
