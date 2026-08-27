"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { workflowTemplateSchema } from "@/lib/validations";

// ========== WorkflowTemplate Actions ==========

export async function createWorkflowTemplate(formData: FormData) {
  await requireAdmin();

  const parsed = workflowTemplateSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { name, description } = parsed.data;

  const template = await prisma.workflowTemplate.create({
    data: {
      name,
      description,
    },
  });

  revalidatePath("/admin/templates");
  redirect(`/admin/templates/${template.id}`);
}

export async function updateWorkflowTemplate(templateId: string, formData: FormData) {
  await requireAdmin();

  const parsed = workflowTemplateSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, description } = parsed.data;

  try {
    await prisma.workflowTemplate.update({
      where: { id: templateId },
      data: {
        name,
        description,
      },
    });

    revalidatePath("/admin/templates");
    revalidatePath(`/admin/templates/${templateId}`);
    return { success: true };
  } catch (error) {
    console.error("Error updating template:", error);
    return { error: (await getTranslations("errors.template"))("updateFailed") };
  }
}

export async function deleteWorkflowTemplate(templateId: string) {
  await requireAdmin();

  // Delete all related data (cascading should handle this, but let's be explicit)
  await prisma.workflowTemplate.delete({
    where: { id: templateId },
  });

  revalidatePath("/admin/templates");
  redirect("/admin/templates");
}

export async function getWorkflowTemplates() {
  await requireAdmin();

  return prisma.workflowTemplate.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { stages: true },
      },
    },
  });
}

export async function getWorkflowTemplate(templateId: string) {
  await requireAdmin();

  return prisma.workflowTemplate.findUnique({
    where: { id: templateId },
    include: {
      stages: {
        orderBy: { order: "asc" },
        include: {
          defaultTeam: true,
          dependencies: {
            include: {
              stage: true,
              dependsOn: true,
            },
          },
          dependents: {
            include: {
              stage: true,
              dependsOn: true,
            },
          },
        },
      },
    },
  });
}
