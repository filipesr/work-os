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
    return { error: "Template name is required" };
  }

  try {
    const template = await prisma.workflowTemplate.create({
      data: {
        name,
        description: description || "",
      },
    });

    revalidatePath("/admin/templates");
    redirect(`/admin/templates/${template.id}`);
  } catch (error) {
    console.error("Error creating template:", error);
    return { error: "Failed to create template" };
  }
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

  try {
    // Delete all related data (cascading should handle this, but let's be explicit)
    await prisma.workflowTemplate.delete({
      where: { id: templateId },
    });

    revalidatePath("/admin/templates");
    redirect("/admin/templates");
  } catch (error) {
    console.error("Error deleting template:", error);
    return { error: "Failed to delete template" };
  }
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
              dependsOn: true,
            },
          },
          dependents: {
            include: {
              stage: true,
            },
          },
        },
      },
    },
  });
}
