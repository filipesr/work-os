import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { Building2 } from "lucide-react";
import prisma from "@/lib/prisma";
import { toNasClientFolder } from "@/lib/nas/path";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";
import { SimpleEntityCrudList, type CrudItem } from "@/components/admin/SimpleEntityCrudList";
import { DeleteClientButton } from "./delete-client-button";

export const metadata: Metadata = {
  title: "Clientes",
};

async function getClients() {
  await requireManagerOrAdmin();
  return await prisma.client.findMany({
    include: {
      _count: {
        select: { projects: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

async function createClient(formData: FormData) {
  "use server";
  await requireManagerOrAdmin();
  const name = formData.get("name") as string;
  if (!name) return;

  // Deriva a pasta-raiz do NAS do nome (pré-requisito de upload; editável até o 1º upload).
  const data = { name, folderName: toNasClientFolder(name) || null };
  try {
    await prisma.client.create({ data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      await prisma.client.create({ data: { name } }); // colisão de pasta — define depois em Editar
    } else {
      throw e;
    }
  }

  revalidatePath("/admin/clients");
}

async function deleteClient(formData: FormData) {
  "use server";
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  await prisma.client.delete({
    where: { id },
  });

  revalidatePath("/admin/clients");
}

export default async function ClientsPage() {
  const clients = await getClients();
  const t = await getTranslations("admin.clients");

  const items: CrudItem[] = clients.map((client) => ({
    id: client.id,
    href: `/admin/clients/${client.id}`,
    title: client.name,
    meta: t("projectsCount", { count: client._count.projects }),
    actions: <DeleteClientButton clientId={client.id} deleteAction={deleteClient} />,
  }));

  return (
    <SimpleEntityCrudList
      kicker={t("kicker")}
      title={t("title")}
      subtitle={t("subtitle")}
      createTitle={t("createTitle")}
      createAction={createClient}
      createFields={[{ name: "name", placeholder: t("namePlaceholder"), required: true }]}
      createButtonLabel={t("createButton")}
      items={items}
      emptyLabel={t("noClients")}
      emptyIcon={Building2}
    />
  );
}
