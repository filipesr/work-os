import { auth } from "@/auth"
import Link from "next/link"
import { Navbar } from "@/components/navbar"
import { UserRole } from "@prisma/client"

export default async function Home() {
  const session = await auth()
  const userRole = session?.user ? ((session.user as any).role as UserRole) : null

  return (
    <div className="min-h-screen bg-background">
      {session?.user && <Navbar />}

      <div className="flex items-center justify-center py-16 px-4">
        <div className="text-center max-w-4xl">
          <h1 className="text-5xl font-bold mb-4 text-foreground bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Work OS
          </h1>
          <p className="text-xl text-muted-foreground mb-12 font-medium">
            Sistema de Gestão de Operações
          </p>

          {session?.user ? (
            <div className="space-y-8">
              <div className="bg-card border-2 border-border rounded-xl p-6 shadow-md">
                <p className="text-lg text-foreground">
                  Bem-vindo, <span className="font-bold text-primary">{session.user.name}</span>!
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {session.user.email} • <span className="font-semibold">{userRole}</span>
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                <Link
                  href="/admin/tasks"
                  className="group p-8 bg-card border-2 border-border rounded-xl shadow-md hover:shadow-xl hover:border-primary transition-all duration-200"
                >
                  <h3 className="font-bold text-xl mb-3 text-foreground group-hover:text-primary transition-colors">
                    Tarefas
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Visualize e gerencie suas tarefas
                  </p>
                </Link>

                {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
                  <>
                    <Link
                      href="/admin/clients"
                      className="group p-8 bg-card border-2 border-border rounded-xl shadow-md hover:shadow-xl hover:border-primary transition-all duration-200"
                    >
                      <h3 className="font-bold text-xl mb-3 text-foreground group-hover:text-primary transition-colors">
                        Admin
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Gerencie clientes, projetos e times
                      </p>
                    </Link>

                    <Link
                      href="/reports"
                      className="group p-8 bg-card border-2 border-border rounded-xl shadow-md hover:shadow-xl hover:border-primary transition-all duration-200"
                    >
                      <h3 className="font-bold text-xl mb-3 text-foreground group-hover:text-primary transition-colors">
                        Relatórios
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Visualize métricas e análises
                      </p>
                    </Link>
                  </>
                )}

                {userRole === UserRole.ADMIN && (
                  <Link
                    href="/admin/templates"
                    className="group p-8 bg-card border-2 border-border rounded-xl shadow-md hover:shadow-xl hover:border-primary transition-all duration-200"
                  >
                    <h3 className="font-bold text-xl mb-3 text-foreground group-hover:text-primary transition-colors">
                      Templates
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Configure workflows e estágios
                    </p>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-lg text-muted-foreground">Faça login para começar</p>
              <Link
                href="/auth/signin"
                className="inline-block px-8 py-3.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-md hover:shadow-lg transition-all duration-200"
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
