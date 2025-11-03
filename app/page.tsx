import { auth } from "@/auth"
import Link from "next/link"

export default async function Home() {
  const session = await auth()

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Work OS</h1>
        <p className="text-xl text-gray-600 mb-8">Sistema de Gestão de Operações</p>

        {session?.user ? (
          <div className="space-y-4">
            <p className="text-lg">
              Bem-vindo, <span className="font-semibold">{session.user.name}</span>!
            </p>
            <p className="text-sm text-gray-500">
              Email: {session.user.email}
            </p>
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
  )
}
