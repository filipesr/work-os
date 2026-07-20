"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMemberOrHigher, requireManagerOrAdmin } from "@/lib/permissions";
import { createProjectSchema } from "@/lib/validations";

interface CreateProjectData {
  name: string;
  description?: string;
  clientId: string;
}

export async function createProject(data: CreateProjectData) {
  try {
    await requireMemberOrHigher();

    const parsed = createProjectSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const { name, description, clientId } = parsed.data;

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return { error: "Cliente não encontrado" };
    }

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        clientId,
      },
      include: {
        client: true,
      },
    });

    revalidatePath("/admin/clients");
    revalidatePath("/admin/tasks/new");
    revalidatePath("/projects");

    return { project };
  } catch (error) {
    console.error("Error creating project:", error);
    return { error: "Erro ao criar projeto" };
  }
}

export async function getProjects() {
  try {
    await requireMemberOrHigher();

    const projects = await prisma.project.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return projects;
  } catch (error) {
    console.error("Error fetching projects:", error);
    return [];
  }
}

// ========== Project detail page actions (movidas de admin/projects/[projectId]/page) ==========

export async function updateProject(formData: FormData) {
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const clientId = formData.get("clientId") as string;
  if (!id || !name || !clientId) return;

  await prisma.project.update({
    where: { id },
    data: {
      name,
      description: description || null,
      clientId,
    },
  });

  revalidatePath(`/admin/projects/${id}`);
  revalidatePath("/admin/projects");
}

export async function deleteProject(formData: FormData) {
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  await prisma.project.delete({
    where: { id },
  });

  revalidatePath("/admin/projects");
}
