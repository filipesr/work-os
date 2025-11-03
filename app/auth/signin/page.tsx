import { signIn } from "@/auth"

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Work OS</h2>
          <p className="mt-2 text-sm text-gray-600">
            Sistema de Gestão de Operações
          </p>
        </div>
        <div className="mt-8 space-y-4">
          <form
            action={async () => {
              "use server"
              await signIn("google")
            }}
          >
            <button
              type="submit"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Entrar com Google
            </button>
          </form>
          <p className="text-xs text-center text-gray-500 mt-4">
            Ao entrar, você concorda com nossos termos de uso
          </p>
        </div>
      </div>
    </div>
  )
}
