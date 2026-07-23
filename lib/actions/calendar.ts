"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { logger } from "@/lib/logger";

const rescheduleSchema = z.object({
  taskId: z.string().min(1),
  // ISO date (yyyy-mm-dd or full ISO) for the new due date.
  dueDate: z.coerce.date(),
});

/**
 * Reschedule a task to a new due date — used by the calendar Gantt's
 * drag-and-drop. Manager/Admin only (mirrors the reports surface).
 */
export async function rescheduleTask(input: { taskId: string; dueDate: string }) {
  await requireManagerOrAdmin();

  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await prisma.task.update({
      where: { id: parsed.data.taskId },
      data: { dueDate: parsed.data.dueDate },
    });

    revalidatePath("/reports/calendar");
    return { success: true };
  } catch (error) {
    logger.error("[RESCHEDULE TASK] Error:", error);
    return { error: "Failed to reschedule task" };
  }
}
