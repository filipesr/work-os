import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <div className="container mx-auto py-12 px-4 text-center">
      <div className="max-w-md mx-auto space-y-4">
        <h2 className="text-2xl font-bold text-foreground">404</h2>
        <p className="text-sm text-muted-foreground">Projeto não encontrado.</p>
        <Link
          href="/admin/projects"
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Voltar para Projetos
        </Link>
      </div>
    </div>
  );
}
