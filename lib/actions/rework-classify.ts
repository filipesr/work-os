"use server";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

/** Reclassifica um retorno (defeito vs legítimo). Só gestor/admin — ajusta o FTR
 * (da pessoa e da etapa). A pessoa NÃO reclassifica (evita gaming). */
export async function classifyReworkEvent(
  reworkEventId: string,
  reworkClass: "DEFECT" | "LEGITIMATE"
): Promise<{ error?: string } | void> {
  await requireManagerOrAdmin();
  if (reworkClass !== "DEFECT" && reworkClass !== "LEGITIMATE") {
    return { error: "Classificação inválida." };
  }
  await prisma.reworkEvent.update({ where: { id: reworkEventId }, data: { reworkClass } });
  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
}
