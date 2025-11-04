import { auth } from "@/auth"
import Link from "next/link"
import { Navbar } from "@/components/navbar"
import { UserRole } from "@prisma/client"

export default async function Home() {
  const session = await auth()
  const userRole = session?.user ? ((session.user as any).role as UserRole) : null

  return (
    <div className="min-h-screen">
      {session?.user && <Navbar />}

      <div className="flex items-center justify-center py-16">
        <div className="text-center max-w-4xl px-4">
          <h1 className="text-4xl font-bold mb-4">Work OS</h1>
          <p className="text-xl text-gray-600 mb-8">Sistema de Gestão de Operações</p>

          {session?.user ? (
            <div className="space-y-6">
              <p className="text-lg">
                Bem-vindo, <span className="font-semibold">{session.user.name}</span>!
              </p>
              <p className="text-sm text-gray-500">
                Email: {session.user.email} | Role: {userRole}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                <Link
                  href="/admin/tasks"
                  className="p-6 bg-white rounded-lg shadow hover:shadow-lg transition"
                >
                  <h3 className="font-semibold text-lg mb-2">Tarefas</h3>
                  <p className="text-sm text-gray-600">
                    Visualize e gerencie suas tarefas
                  </p>
                </Link>

                {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
                  <>
                    <Link
                      href="/admin/clients"
                      className="p-6 bg-white rounded-lg shadow hover:shadow-lg transition"
                    >
                      <h3 className="font-semibold text-lg mb-2">Admin</h3>
                      <p className="text-sm text-gray-600">
                        Gerencie clientes, projetos e times
                      </p>
                    </Link>

                    <Link
                      href="/reports"
                      className="p-6 bg-white rounded-lg shadow hover:shadow-lg transition"
                    >
                      <h3 className="font-semibold text-lg mb-2">Relatórios</h3>
                      <p className="text-sm text-gray-600">
                        Visualize métricas e análises
                      </p>
                    </Link>
                  </>
                )}

                {userRole === UserRole.ADMIN && (
                  <Link
                    href="/admin/templates"
                    className="p-6 bg-white rounded-lg shadow hover:shadow-lg transition"
                  >
                    <h3 className="font-semibold text-lg mb-2">Templates</h3>
                    <p className="text-sm text-gray-600">
                      Configure workflows e estágios
                    </p>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600">Faça login para começar</p>
              <Link
                href="/auth/signin"
                className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Entrar
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
