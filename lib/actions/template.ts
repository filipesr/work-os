"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";

// ========== WorkflowTemplate Actions ==========

export async function createWorkflowTemplate(formData: FormData) {
  await requireAdmin();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  if (!name) {
    throw new Error("Template name is required");
  }

  const template = await prisma.workflowTemplate.create({
    data: {
      name,
      description: description || "",
    },
  });

  revalidatePath("/admin/templates");
  redirect(`/admin/templates/${template.id}`);
}

export async function updateWorkflowTemplate(
  templateId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  if (!name) {
    return { error: "Template name is required" };
  }

  try {
    await prisma.workflowTemplate.update({
      where: { id: templateId },
      data: {
        name,
        description: description || "",
      },
    });

    revalidatePath("/admin/templates");
    revalidatePath(`/admin/templates/${templateId}`);
    return { success: true };
  } catch (error) {
    console.error("Error updating template:", error);
    return { error: "Failed to update template" };
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
