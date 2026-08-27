"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMemberOrHigher, requireManagerOrAdmin } from "@/lib/permissions";
import { createClientSchema } from "@/lib/validations";
import { toNasClientFolder } from "@/lib/nas/path";

interface CreateClientData {
  name: string;
  description?: string;
  email?: string;
  phone?: string;
}

export async function createClient(data: CreateClientData) {
  try {
    await requireMemberOrHigher();

    const parsed = createClientSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const { name, description, email, phone } = parsed.data;

    // Deriva a pasta-raiz do NAS do nome (o único pré-requisito de upload). Fica editável até o
    // primeiro upload. Em colisão do @unique, cria sem — define-se depois em Editar.
    const createData = {
      name: name.trim(),
      description: description?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      folderName: toNasClientFolder(name.trim()) || null,
    };
    let client;
    try {
      client = await prisma.client.create({ data: createData });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const { folderName: _drop, ...rest } = createData;
        void _drop;
        client = await prisma.client.create({ data: rest });
      } else {
        throw e;
      }
    }

    revalidatePath("/admin/clients");
    revalidatePath("/admin/tasks/new");

    return { client };
  } catch (error) {
    console.error("Error creating client:", error);
    const t = await getTranslations("errors.client");
    return { error: t("createFailed") };
  }
}

export async function getClients() {
  try {
    await requireMemberOrHigher();

    const clients = await prisma.client.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    });

    return clients;
  } catch (error) {
    console.error("Error fetching clients:", error);
    return [];
  }
}

// ========== Client detail page actions (movidas de admin/clients/[clientId]/page) ==========

// folderName (pasta-raiz do cliente no NAS) trava assim que existe qualquer artefato NAS sob o
// cliente — renomear a pasta depois divergiria dos caminhos já gravados.
export async function isClientFolderLocked(clientId: string): Promise<boolean> {
  const count = await prisma.taskArtifact.count({
    where: { storageKind: "NAS_UPLOAD", task: { project: { clientId } } },
  });
  return count > 0;
}

export async function updateClient(formData: FormData) {
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const folderNameRaw = ((formData.get("folderName") as string | null) ?? "").trim();
  if (!id || !name) return;

  const data: Prisma.ClientUpdateInput = {
    name,
    description: description || null,
    email: email || null,
    phone: phone || null,
  };

  // Only touch folderName while it's still editable (no NAS artifact yet). Empty input -> derive
  // from the client name. Always slugified to a filesystem-safe folder label.
  if (!(await isClientFolderLocked(id))) {
    const desired = toNasClientFolder(folderNameRaw || name);
    data.folderName = desired || null;
  }

  try {
    await prisma.client.update({ where: { id }, data });
  } catch (e) {
    // Unique collision on folderName — save everything else and leave the folder untouched.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const { folderName: _drop, ...rest } = data;
      void _drop;
      await prisma.client.update({ where: { id }, data: rest });
    } else {
      throw e;
    }
  }

  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin/clients");
}

export async function deleteClient(formData: FormData) {
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  await prisma.client.delete({
    where: { id },
  });

  revalidatePath("/admin/clients");
}

export async function createClientProject(formData: FormData) {
  await requireManagerOrAdmin();
  const clientId = formData.get("clientId") as string;
  const name = formData.get("name") as string;
  if (!clientId || !name?.trim()) return;

  await prisma.project.create({
    data: { name: name.trim(), clientId },
  });

  revalidatePath(`/admin/clients/${clientId}`);
}

export async function setProjectStatus(formData: FormData) {
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  const clientId = formData.get("clientId") as string;
  const status = formData.get("status") as string;
  if (!id || (status !== "ACTIVE" && status !== "INACTIVE")) return;

  await prisma.project.update({
    where: { id },
    data: { status: status as "ACTIVE" | "INACTIVE" },
  });

  revalidatePath(`/admin/clients/${clientId}`);
}
