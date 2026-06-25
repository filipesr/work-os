"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMemberOrHigher } from "@/lib/permissions";
import { createClientSchema } from "@/lib/validations";

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

    const client = await prisma.client.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
      },
    });

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
