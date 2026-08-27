"use server";

import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin, getSessionUser } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

/**
 * Record a 1:1 held with `userId` today (manager = current user). Manager/admin
 * only. Powers the 1:1-cadence signal (getOneOnOneCadence).
 */
export async function logOneOnOne(
  userId: string,
  notes?: string
): Promise<{ error: string } | void> {
  await requireManagerOrAdmin();
  const manager = await getSessionUser();

  if (!userId) {
    const t = await getTranslations("errors.oneOnOne");
    return { error: t("memberRequired") };
  }

  await prisma.oneOnOneLog.create({
    data: {
      userId,
      managerId: manager.id,
      occurredAt: new Date(),
      notes: notes?.trim() || null,
    },
  });

  revalidatePath("/admin");
}
