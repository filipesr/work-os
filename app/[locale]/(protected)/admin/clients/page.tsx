import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { requireManagerOrAdmin } from "@/lib/permissions"
import { DeleteClientButton } from "./delete-client-button"
import { getTranslations } from "next-intl/server"

async function getClients() {
  await requireManagerOrAdmin()
  return await prisma.client.findMany({
    include: {
      _count: {
        select: { projects: true },
      },
    },
    orderBy: { name: "asc" },
  })
}

async function createClient(formData: FormData) {
  "use server"
  await requireManagerOrAdmin()
  const name = formData.get("name") as string
  if (!name) return

  await prisma.client.create({
    data: { name },
  })

  revalidatePath("/admin/clients")
}

async function updateClient(formData: FormData) {
  "use server"
  await requireManagerOrAdmin()
  const id = formData.get("id") as string
  const name = formData.get("name") as string
  if (!id || !name) return

  await prisma.client.update({
    where: { id },
    data: { name },
  })

  revalidatePath("/admin/clients")
}

async function deleteClient(formData: FormData) {
  "use server"
  await requireManagerOrAdmin()
  const id = formData.get("id") as string
  if (!id) return

  await prisma.client.delete({
    where: { id },
  })

  revalidatePath("/admin/clients")
}

export default async function ClientsPage() {
  const clients = await getClients()
  const t = await getTranslations("admin.clients")

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Create Form */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">{t("createTitle")}</h2>
        <form action={createClient} className="flex gap-4">
          <input
            type="text"
            name="name"
            placeholder={t("namePlaceholder")}
            required
            className="flex-1 h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
          />
          <button
            type="submit"
            className="px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-primary/10 shadow-sm hover:shadow-md transition-all duration-200"
          >
            {t("createButton")}
          </button>
        </form>
      </div>

      {/* Clients List */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.name")}
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.projects")}
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {clients.map((client) => (
              <tr key={client.id} className="hover:bg-accent transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-semibold text-foreground">
                    {client.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-muted-foreground">
                    {t("projectsCount", { count: client._count.projects })}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <DeleteClientButton clientId={client.id} deleteAction={deleteClient} />
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  {t("noClients")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
