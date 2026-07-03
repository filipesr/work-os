"use server";

// CRUD de DeliverablePurpose (propósito do entregável — tag pesquisável que compõe o nome do
// arquivo no NAS). Admin (MANAGER+). Não há delete: propósitos usados por artefatos têm
// onDelete: Restrict; em vez de apagar, desativa-se (active=false) para sair de novos uploads.

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function listDeliverablePurposes() {
  await requireManagerOrAdmin();
  return prisma.deliverablePurpose.findMany({ orderBy: [{ order: "asc" }, { label: "asc" }] });
}

export async function createDeliverablePurpose(formData: FormData): Promise<void> {
  await requireManagerOrAdmin();
  const label = ((formData.get("label") as string) ?? "").trim();
  if (!label) return;
  const slug = slugify(label);
  if (!slug) return;

  try {
    await prisma.deliverablePurpose.create({ data: { label, slug } });
  } catch (e) {
    // Duplicate slug — swallow (admin can rename the existing one).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
  revalidatePath("/admin/deliverable-purposes");
}

export async function renameDeliverablePurpose(formData: FormData): Promise<void> {
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  const label = ((formData.get("label") as string) ?? "").trim();
  if (!id || !label) return;
  const slug = slugify(label);
  if (!slug) return;

  try {
    await prisma.deliverablePurpose.update({ where: { id }, data: { label, slug } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
  revalidatePath("/admin/deliverable-purposes");
}

export async function toggleDeliverablePurpose(formData: FormData): Promise<void> {
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  const p = await prisma.deliverablePurpose.findUnique({ where: { id }, select: { active: true } });
  if (!p) return;
  await prisma.deliverablePurpose.update({ where: { id }, data: { active: !p.active } });
  revalidatePath("/admin/deliverable-purposes");
}
