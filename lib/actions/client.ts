"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMemberOrHigher } from "@/lib/permissions";
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
    return { error: "Erro ao criar cliente" };
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
